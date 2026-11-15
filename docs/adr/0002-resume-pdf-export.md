# ADR 0002: Single-Column PDF Export with PDFKit

Date: October 5, 2026

Status: Accepted for the Phase 2 PDF renderer after explicit owner selection. JSON domain snapshot design remains reviewable in the Phase 2 design document.

## Problem

Produce private, readable, text-based resume PDFs which can be inspected by a human and parsed as text by ATS software. Keep the local Docker stack lightweight and allow later export adapters.

## Alternatives

- PDFKit: direct Node PDF/text/font control without a browser; layout is dedicated code.
- React PDF: reusable JSX document templates and a dedicated layout engine; not standard HTML/CSS.
- HTML/Chromium: familiar print styling and HTML preview; requires a managed browser runtime and additional resources.

## Decision

The owner selected PDFKit after reviewing [format and renderer research](../resume-export-research.md). Use one English single-column template, embedded licensed Noto Sans fonts, normal body text for contact details, conventional section headings and sequential text order. Support Cyrillic candidate content without changing the English template labels.

Published versions retain exact PDF bytes, a checksum, profile/vacancy snapshots and accepted changes. Generation is bounded to 20 pages and 2.5 MB with an 8-second stream timeout. No queued retry history is claimed; durable export execution follows in Phase 3.

## Consequences

The API needs no Chromium installation. Fonts are bundled and generate no external requests. Text extraction and rendered page inspection are required verification. Format compatibility does not guarantee ATS ranking or an interview. DOCX requires a separate future exporter. The chosen library does not lock the profile/draft/version domain to one output engine.
