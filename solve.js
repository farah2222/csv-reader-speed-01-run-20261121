// solve.js — a fast, dependency-free drop-in for csv-reader 1.0.0.
//
// run(input) returns exactly the answer csv-reader 1.0.0 returns for the same
// {text, header}: the JSON value {columns, rows, errors}. Every line below is
// written from the rules as published in the kit (RULES.txt); no CSV library
// was copied or wrapped.
//
// Strategy: instead of walking the text one character at a time, each field
// is located with String.indexOf over the next delimiter, and a clean field
// is taken with a single String.slice. Only a field that actually holds a
// lone carriage return, a doubled quote, or an embedded line break takes a
// slow path, and those are a fraction of a percent of the data. Quoted fields
// find their closing quote with indexOf, skipping "" pairs, and only run a
// regex when the content really needs unescaping or line-break normalising.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  // A leading U+FEFF is a byte-order mark, not data.
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  const COMMA = 0;
  const LINE_BREAK = 1;
  const END = 2;

  // Read one unquoted field starting at `pos`. `prefix` is text already read
  // for this field ("" for a fresh field, the quoted content for quote junk,
  // or '"' when an unterminated quote is re-read as unquoted). Returns
  // {value, ended, added}, where `added` counts the characters appended after
  // the prefix (used to decide whether quote junk was really appended).
  function readUnquoted(prefix) {
    let value = prefix;
    let added = 0;
    const comma = text.indexOf(",", pos);
    const lf = text.indexOf("\n", pos);
    const c = comma === -1 ? Infinity : comma;
    const n = lf === -1 ? Infinity : lf;
    const term = c < n ? c : n;
    const field = term === Infinity ? text.slice(pos) : text.slice(pos, term);
    const cr = field.indexOf("\r");
    if (cr === -1) {
      value += field;
      added += field.length;
      if (term === Infinity) {
        pos = len;
        return { value, ended: END, added };
      }
      if (term === c) {
        pos = term + 1;
        return { value, ended: COMMA, added };
      }
      pos = term + 1;
      line += 1;
      return { value, ended: LINE_BREAK, added };
    }
    // The field holds carriage return(s). A CR immediately before the LF
    // terminator is the CRLF line break, not an error; every other CR is a
    // stray CR: it is dropped and reported. (A trailing CR with no LF after
    // it — the field runs to the end of the text — is a stray CR too.)
    const isLF = lf !== -1 && term === n;
    let clean = "";
    let stray = 0;
    for (let i = 0; i < field.length; i++) {
      if (field.charCodeAt(i) === 13) {
        if (isLF && i === field.length - 1) continue;
        stray += 1;
        continue;
      }
      clean += field[i];
    }
    for (let i = 0; i < stray; i++) {
      errors.push({ code: "stray_cr", line: recordLine, row: recordRow });
    }
    value += clean;
    added += clean.length;
    if (term === Infinity) {
      pos = len;
      return { value, ended: END, added };
    }
    if (term === c) {
      pos = term + 1;
      return { value, ended: COMMA, added };
    }
    pos = term + 1;
    line += 1;
    return { value, ended: LINE_BREAK, added };
  }

  // Read one quoted field starting at `pos` (text[pos] === '"'). Returns the
  // same shape as readUnquoted.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let q = text.indexOf('"', open + 1);
    let doubled = false;
    while (q !== -1 && text.charCodeAt(q + 1) === 34) {
      doubled = true;
      q = text.indexOf('"', q + 2);
    }
    if (q === -1) {
      // The quote never closes: it is a literal character and the text after
      // it is re-read as an unquoted field starting just after the opening
      // quote.
      pos = open + 1;
      line = openLine;
      errors.push({ code: "unterminated_quote", line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    const content = text.slice(open + 1, q);
    let value;
    if (!doubled && content.indexOf("\n") === -1 && content.indexOf("\r") === -1) {
      value = content;
    } else {
      // Collapse doubled quotes and normalise every line break inside the
      // quotes to a single LF, counting them for the line tracker.
      let breaks = 0;
      value = content.replace(/""|\r\n|\r|\n/g, (m) => {
        if (m === '""') return '"';
        breaks += 1;
        return "\n";
      });
      line += breaks;
    }
    pos = q + 1;
    if (pos >= len) return { value, ended: END, added: 0 };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA, added: 0 };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK, added: 0 };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK, added: 0 };
    }
    // Anything else after the closing quote is junk appended to the field.
    const junk = readUnquoted(value);
    if (junk.added > 0) {
      errors.push({ code: "quote_junk", line: recordLine, row: recordRow });
    }
    return junk;
  }

  while (true) {
    // A line left with no characters is no record.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let lastQuoted = false;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      field = lastQuoted ? readQuoted() : readUnquoted("");
      fields.push(field.value);
    } while (field.ended === COMMA);
    // A record holding exactly one empty unquoted field is a line of stray
    // CRs only; the record is skipped but its stray_cr errors stay.
    if (fields.length === 1 && fields[0] === "" && !lastQuoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: "short_row", line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push("");
    } else if (fields.length > width) {
      errors.push({ code: "long_row", line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
