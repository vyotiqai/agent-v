import type { PdfField } from "@agent-v/shared";
import { PDFBool, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFTextField } from "pdf-lib";
import { AppError } from "../errors.ts";

export const maxPdfBytes = 10 * 1024 * 1024;

export function isPdf(bytes: Uint8Array) {
  return bytes.length > 4 && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}

async function load(bytes: Uint8Array) {
  if (!isPdf(bytes)) throw new AppError("That file is not a PDF", 422);
  if (bytes.length > maxPdfBytes) throw new AppError("PDFs must be 10 MB or smaller", 413);
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (/encrypt/i.test((error as Error).message))
      throw new AppError("Encrypted PDFs are not supported", 422);
    throw new AppError("The PDF could not be read", 422);
  }
}

function fieldsOf(doc: PDFDocument): PdfField[] {
  return doc
    .getForm()
    .getFields()
    .slice(0, 300)
    .map((field) => {
      const name = field.getName();
      if (field instanceof PDFTextField)
        return { name, type: "text", value: field.getText() ?? "" };
      if (field instanceof PDFCheckBox) return { name, type: "checkbox", value: field.isChecked() };
      return { name, type: "unsupported", value: null };
    });
}

export async function inspectPdf(bytes: Uint8Array) {
  const doc = await load(bytes);
  if (doc.catalog.has(PDFName.of("XFA")) || doc.getForm().acroForm.dict.has(PDFName.of("XFA")))
    return { pageCount: doc.getPageCount(), fields: [] as PdfField[], xfa: true };
  return { pageCount: doc.getPageCount(), fields: fieldsOf(doc), xfa: false };
}

/** Remove document- and page-level scripts so a filled copy cannot run code in a viewer. */
function stripActions(doc: PDFDocument) {
  doc.catalog.delete(PDFName.of("OpenAction"));
  doc.catalog.delete(PDFName.of("AA"));
  const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  names?.delete(PDFName.of("JavaScript"));
  for (const page of doc.getPages()) page.node.delete(PDFName.of("AA"));
  for (const field of doc.getForm().getFields()) {
    field.acroField.dict.delete(PDFName.of("AA"));
    for (const widget of field.acroField.getWidgets()) {
      widget.dict.delete(PDFName.of("AA"));
      widget.dict.delete(PDFName.of("A"));
    }
  }
}

/** Return a new PDF with the given text and checkbox values. The original is untouched. */
export async function fillPdf(bytes: Uint8Array, values: Record<string, string | boolean>) {
  const doc = await load(bytes);
  const form = doc.getForm();
  const known = new Map(form.getFields().map((f) => [f.getName().toLowerCase(), f]));
  const unknown: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    const field = known.get(name.toLowerCase());
    if (field instanceof PDFTextField) field.setText(String(value));
    else if (field instanceof PDFCheckBox) {
      const on =
        typeof value === "boolean" ? value : /^(y|yes|true|x|checked|1)$/i.test(value.trim());
      if (on) field.check();
      else field.uncheck();
    } else unknown.push(name);
  }
  if (unknown.length)
    throw new AppError(
      `These fields are not fillable text or checkboxes: ${unknown.join(", ")}`,
      422,
    );
  form.acroForm.dict.set(PDFName.of("NeedAppearances"), PDFBool.True);
  form.updateFieldAppearances();
  stripActions(doc);
  const out = await doc.save();
  return {
    bytes: out,
    fields: fieldsOf(await PDFDocument.load(out)),
    pageCount: doc.getPageCount(),
  };
}
