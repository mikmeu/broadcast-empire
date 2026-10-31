// The editor's preview (0.21.0): the draft is put on the game's list of furniture as `mod:editor-preview`, so the room
// renderer can draw it, and taken off again when the editor closes. Otherwise it would show in a game's catalog.

import type { FurnitureType } from '../config/office';
import { PREVIEW_ID } from './draft';
import type { ModFurniture } from './furnitureFile';
import { registerModPiece, unregisterModPiece } from './load';

export const PREVIEW_TYPE: FurnitureType = `mod:${PREVIEW_ID}`;

/**
 * Shows drafts one after another. A model that is not saved yet is drawn from a blob address; `useGLTF` keeps what it
 * loaded by address, so each new model gets a new address and the old one is let go.
 */
export function createPreview() {
  let bytes: Uint8Array | undefined;
  let url: string | undefined;
  const release = () => {
    if (url) URL.revokeObjectURL(url);
    url = undefined;
  };
  return {
    /** Registers the draft as the preview piece; returns what to draw. */
    show(draft: ModFurniture): FurnitureType {
      if (draft.glb !== bytes) {
        release();
        bytes = draft.glb;
        if (bytes) url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'model/gltf-binary' }));
      }
      registerModPiece({ ...draft, id: PREVIEW_ID }, url);
      return PREVIEW_TYPE;
    },
    /** Takes the preview off the game's list. */
    stop() {
      unregisterModPiece(PREVIEW_ID);
      release();
      bytes = undefined;
    },
  };
}
