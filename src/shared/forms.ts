// PlexiForms: capture requests, leads, briefs and data. A form is a thin layer
// over a Table: its fields ARE the backing table's typed columns, and every
// submission is a row in that table. That means responses are instantly
// filterable, chartable in PlexiDash, and usable everywhere a table is, with no
// export-import dance.
//
// This is the self-contained half: design a form and fill it in-app, responses
// land in the table. Public, shareable submission links are the later half that
// needs the hosting/viewer layer. Nothing is fabricated: a new form has no
// responses until someone fills it.

export interface PlexiForm {
  id: string
  title: string
  description: string
  // The fb_tables id that holds this form's columns (its fields) and rows (its
  // responses). Created with the form; the form builder edits the table schema.
  tableId: string
  createdAt: number
  updatedAt: number
}

export interface PlexiFormDraft {
  title?: string
  description?: string
  tableId: string
}

export interface PlexiFormPatch {
  title?: string
  description?: string
}
