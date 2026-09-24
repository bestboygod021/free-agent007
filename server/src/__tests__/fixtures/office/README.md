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
