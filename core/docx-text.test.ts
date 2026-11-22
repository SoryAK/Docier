import { Document, Packer, Paragraph, TextRun } from "docx";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DOCX_DOCUMENT_MAX_BYTES, documentXmlText, readDocxText } from "./docx-text";

describe("reading a .docx resume", () => {
  it("reads the paragraphs of a real .docx file", async () => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ children: [new TextRun({ text: "Jordan Rivera", bold: true })] }),
            new Paragraph("Maintenance Technician — Buckeye Packaging Co. & Sons"),
            new Paragraph("Kept three lines running."),
          ],
        },
      ],
    });
    const bytes = new Uint8Array(await Packer.toBuffer(doc));
    expect(readDocxText(bytes)).toBe(
      "Jordan Rivera\nMaintenance Technician — Buckeye Packaging Co. & Sons\nKept three lines running.",
    );
  });

  it("keeps tabs and breaks, and leaves out field codes and deleted text", () => {
    const xml =
      '<w:body><w:p><w:r><w:t>Lead</w:t><w:tab/><w:t xml:space="preserve">2021 </w:t></w:r></w:p>' +
      "<w:p><w:r><w:instrText>HYPERLINK \"https://x\"</w:instrText><w:t>Site</w:t><w:br/><w:t>Next &amp; last</w:t>" +
      "<w:delText>gone</w:delText></w:r></w:p></w:body>";
    expect(documentXmlText(xml)).toBe("Lead\t2021\nSite\nNext & last");
  });

  it("returns nothing for a file that isn't a .docx", () => {
    expect(readDocxText(strToU8("%PDF-1.4 not a zip"))).toBeNull();
    expect(readDocxText(zipSync({ "other.xml": strToU8("<x/>") }))).toBeNull();
  });

  it("won't unpack a document part larger than the limit", () => {
    const huge = zipSync({ "word/document.xml": new Uint8Array(DOCX_DOCUMENT_MAX_BYTES + 1) });
    expect(readDocxText(huge)).toBeNull();
  });
});
