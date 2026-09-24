# Office fixtures

These are **not** written by this repository's code, and that is the point.

`word-document.docx` and `excel-workbook.xlsx` were produced by `python-docx`
and `openpyxl`; `word-hazards.docx` is a genuine Word template (shipped inside
the `python-docx` wheel) with its `word/document.xml` replaced, repackaged by
Python's `zipfile`.

Testing a ZIP reader against an archive written by the same project is
circular: a shared misunderstanding of the format passes. Every byte of the
container here — local headers, deflate streams, the central directory — comes
from an implementation with no relationship to `office-zip.ts`.

`word-hazards.docx` deliberately contains the cases that break naive parsers:
a word split across runs, `xml:space="preserve"`, `<w:br/>`, `<w:tab/>`, XML
entities, non-ASCII and RTL text, a table, and a `<w:instrText>` field
instruction whose target must not reach the extracted text.

`sparse-columns.xlsx` has gaps: row 2 omits column B and row 4 omits A and C.
Excel writes no `<c>` element at all for an empty cell, so reading cells in
document order files each value under the wrong column. The gaps are what
makes the `r="C2"` reference load-bearing.

`renumbered-sheets.xlsx` is `openpyxl` output repacked so the second tab's
part is `sheet3.xml` while the first is `sheet1.xml` — the state Excel leaves
an archive in after a middle sheet is deleted. `openpyxl` renumbers on save
and never produces this, which is exactly why the fixture had to be built by
hand from a real one: the positional guess `sheet{n+1}.xml` passes every test
a library-written file can provide. Verified against a real reader: `openpyxl`
opens it and sees both `First` and `Third`.
