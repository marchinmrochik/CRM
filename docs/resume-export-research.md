# Resume Export Research

Research date: October 5, 2026. Renderer selection remains pending owner approval.

## Format requirements

Greenhouse lists column layouts, tables, graphics, image resumes, unclear sections and contact information inside headers/footers/text boxes among parsing failure causes. It cannot parse files larger than 2.5 MB. Lever's developer documentation describes parsed resumes extracted from PDF/Word documents. These sources support simple text documents; they do not rank generation libraries or guarantee hiring outcomes.

The proposed template uses one column, visible selectable text, contact details in the document body, conventional English section labels, readable typography, explicit job titles/company/dates, no photos/skill bars/tables, and embedded fonts. Target PDF size is below 2.5 MB. A job portal's explicit format requirement takes precedence. DOCX remains a separate future exporter, not an output capability of the three PDF renderers.

## Adoption snapshot

Primary-source npm downloads for September 27 to October 3, 2026 and GitHub API counts at research time:

| Tool                | Weekly npm downloads | GitHub stars | Interpretation                                                                               |
| ------------------- | -------------------: | -----------: | -------------------------------------------------------------------------------------------- |
| pdfkit              |           11,919,809 |       10,709 | Widely used Node PDF engine; downloads include non-resume use and transitive installs        |
| @react-pdf/renderer |            7,667,743 |       16,815 | Widely used React document renderer; counts do not prove ATS compatibility                   |
| puppeteer           |           14,320,011 |       95,655 | General browser automation library; these numbers cannot be interpreted as PDF-only adoption |

There is no standardized verified user-review dataset establishing a winner for resume ATS parsing. Maintenance activity, reproducible rendering and our own output checks matter more than star totals or isolated issue reports.

## Fit for this product

PDFKit: direct Node text/font/page API, no browser runtime, private server generation; layout and pagination require explicit code. Good fit for one conservative template and small local Docker deployment. It produces real text PDFs and supports embedded fonts. It does not provide an HTML/CSS or React component layout.

React PDF (@react-pdf/renderer): declarative Document/Page/View/Text components, a dedicated layout engine, font registration and page wrapping. Good fit for reusable React document templates and multiple future variants. It is not normal HTML/CSS, and the document implementation must be checked for font/line/page behavior. The similarly named react-pdf viewer is a different package. The project uses PDFKit internally, so its React API is not inherently a superior ATS output format.

HTML/Chromium (Puppeteer or Playwright): browser print CSS with familiar HTML, supports producing PDFs using print media. Good fit when matching a rich HTML preview is the main requirement. Browser installation, memory, concurrency and maintenance make server exports heavier. HTML rendering does not itself guarantee correct PDF text order.

Recommendation remains PDFKit for the initial one-column template. React PDF is a realistic alternative if reusable React templates become a priority. Neither tool has a demonstrated intrinsic ATS advantage. All approaches require output tests; none guarantees an interview or an ATS score.

## Sources

- [Greenhouse parsing failures](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse)
- [Lever API documentation](https://hire.lever.co/developer/documentation)
- [PDFKit text and fonts](https://pdfkit.org/docs/text.html)
- [React PDF documentation](https://react-pdf.org/)
- [React PDF fonts](https://react-pdf.org/docs/v4/fonts)
- [React PDF's upstream PDFKit integration](https://react-pdf.org/blog/dropping-the-pdfkit-fork)
- [Puppeteer Page.pdf](https://pptr.dev/api/puppeteer.page.pdf)
- [PDFKit npm downloads](https://api.npmjs.org/downloads/point/2026-09-27:2026-10-03/pdfkit)
- [React PDF npm downloads](https://api.npmjs.org/downloads/point/2026-09-27:2026-10-03/%40react-pdf%2Frenderer)
- [Puppeteer npm downloads](https://api.npmjs.org/downloads/point/2026-09-27:2026-10-03/puppeteer)
