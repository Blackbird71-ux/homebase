// src/lib/pdf/form-fields.ts
// Server-side PDF form field detection and manipulation using pdf-lib.
// Detects AcroForm fields in a PDF and supports reading/writing field values.

import { PDFDocument, PDFCheckBox, PDFDropdown, PDFOptionList, PDFTextField, PDFRadioGroup, PDFSignature } from 'pdf-lib'

export type FormFieldType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'list'
  | 'signature'
  | 'unknown'

export interface DetectedFormField {
  name: string
  type: FormFieldType
  /** Page index (0-based) */
  pageIndex: number
  /** Rectangle position in PDF points (bottom-left origin) */
  rect: { x: number; y: number; width: number; height: number }
  /** Page height in PDF points, for converting to top-left origin */
  pageHeight: number
  /** Current value if any */
  value: string | boolean | null
  /** Options for dropdown/list fields */
  options?: string[]
  /** Whether the field is read-only */
  readonly: boolean
  /** Whether the field is required */
  required: boolean
}

export interface FormFieldValues {
  [fieldName: string]: string | boolean | null
}

/**
 * Read and detect all form fields in a PDF buffer.
 * Returns field metadata with positions relative to their page.
 */
export async function detectFormFields(pdfBytes: Uint8Array): Promise<{
  fields: DetectedFormField[]
  totalPages: number
}> {
  const doc = await PDFDocument.load(pdfBytes)
  const form = doc.getForm()
  const totalPages = doc.getPageCount()

  const fields: DetectedFormField[] = []

  // Try to get all form fields
  try {
    const allFields = form.getFields()

    for (const field of allFields) {
      try {
        const name = field.getName()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fieldAny = field as any
        const widget = fieldAny.getWidget?.() as
          | { getPage?: () => number; getRectangle?: () => { x: number; y: number; width: number; height: number }; getPageNumber?: () => number }
          | undefined

        // Try to determine the page and position
        let pageIndex = 0
        let rect = { x: 0, y: 0, width: 100, height: 20 }
        let pageHeight = 842 // default A4

        if (widget) {
          const widgetPageIdx = widget.getPageNumber?.() ?? widget.getPage?.() ?? 0
          pageIndex = widgetPageIdx

          const widgetRect = widget.getRectangle?.()
          if (widgetRect) {
            rect = widgetRect
          }

          const page = doc.getPage(pageIndex)
          pageHeight = page.getHeight()
        }

        // Determine field type
        let type: FormFieldType = 'unknown'
        let value: string | boolean | null = null
        let options: string[] | undefined

        if (field instanceof PDFTextField) {
          type = 'text'
          value = field.getText() ?? null
        } else if (field instanceof PDFCheckBox) {
          type = 'checkbox'
          try {
            value = field.isChecked()
          } catch {
            value = false
          }
        } else if (field instanceof PDFRadioGroup) {
          type = 'radio'
          try {
            value = field.getSelected() ?? null
          } catch {
            value = null
          }
        } else if (field instanceof PDFDropdown) {
          type = 'dropdown'
          try {
            value = (field.getSelected()?.[0]) ?? null
          } catch {
            value = null
          }
          try {
            options = field.getOptions()
          } catch {
            options = []
          }
        } else if (field instanceof PDFOptionList) {
          type = 'list'
          try {
            value = field.getSelected()?.[0] ?? null
          } catch {
            value = null
          }
          try {
            options = field.getOptions()
          } catch {
            options = []
          }
        } else if (field instanceof PDFSignature) {
          type = 'signature'
        }

        // Determine if read-only / required (check flags)
        // pdf-lib doesn't expose flags directly in all versions,
        // so we'll set defaults and can refine later
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const acroField = (field as any).acroField as
          | { getFlags?: () => number }
          | undefined
        const flags = acroField?.getFlags?.() ?? 0
        const readonly = (flags & 0x01) !== 0   // Flags 1 = ReadOnly
        const required = (flags & 0x02) !== 0    // Flags 2 = Required

        fields.push({
          name,
          type,
          pageIndex,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          pageHeight,
          value,
          options,
          readonly,
          required,
        })
      } catch {
        // Skip fields we can't read
        continue
      }
    }
  } catch {
    // No form fields or form not supported
  }

  return { fields, totalPages }
}

/**
 * Set form field values in a PDF and return the filled PDF bytes.
 */
export async function fillFormFields(
  pdfBytes: Uint8Array,
  values: FormFieldValues,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const form = doc.getForm()

  try {
    const allFields = form.getFields()

    for (const field of allFields) {
      const name = field.getName()
      const val = values[name]

      if (val === undefined || val === null) continue

      if (field instanceof PDFTextField) {
        field.setText(String(val))
      } else if (field instanceof PDFCheckBox) {
        if (val === true || val === 'true' || val === 'Yes' || val === 'yes') {
          try {
            field.check()
          } catch {
            // Checkbox may already be checked or not exist
          }
        } else {
          try {
            field.uncheck()
          } catch {
            // May not be checkable
          }
        }
      } else if (field instanceof PDFDropdown) {
        try {
          field.select(String(val))
        } catch {
          // Option may not be valid
        }
      } else if (field instanceof PDFOptionList) {
        try {
          field.select(String(val))
        } catch {
          // Option may not be valid
        }
      } else if (field instanceof PDFRadioGroup) {
        try {
          field.select(String(val))
        } catch {
          // Option may not be valid
        }
      }
    }
  } catch {
    // Form manipulation may fail for some PDFs
  }

  // Flatten the form so filled values are visible
  try {
    form.flatten()
  } catch {
    // Flattening may not be supported for all form types
  }

  return doc.save()
}
