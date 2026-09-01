import { Extension } from '@tiptap/core'

// Per-table "repeat the header row on every page" flag.
//
// A table that spans a page break loses its column headings on every
// continuation, which is exactly when the reader needs them. Word and Google
// Docs both make this a per-table choice rather than a global one, because a
// two-column lookup table wants it and a layout table does not — so it lives on
// the node, set from the table's right-click menu.
//
// A global attribute rather than a Table.extend(): TableKit assembles the table
// nodes itself, and adding one attribute from the outside avoids re-declaring
// its configuration just to carry a boolean.
export const TableHeaderRepeat = Extension.create({
  name: 'tableHeaderRepeat',
  addGlobalAttributes() {
    return [
      {
        types: ['table'],
        attributes: {
          headerRepeat: {
            default: false,
            // Round-trips through the document body and the HTML exports.
            parseHTML: (el) => el.getAttribute('data-header-repeat') === 'true',
            renderHTML: (attrs) =>
              attrs.headerRepeat ? { 'data-header-repeat': 'true' } : {}
          }
        }
      }
    ]
  }
})
