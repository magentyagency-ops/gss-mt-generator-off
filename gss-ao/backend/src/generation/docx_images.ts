// Insertion d'images dans un .docx (photos jointes à l'assistant, schémas GSS dans les réponses du
// cadre imposé) : l'image est ajoutée à l'archive, déclarée (relation, type) et placée dans un
// paragraphe centré, à la largeur du texte ou de la cellule.

import fs from 'fs';
import PizZip from 'pizzip';
import { DOMParser } from '@xmldom/xmldom';
import { elements } from './completion';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Dimensions (px) d'une image PNG ou JPEG. */
export function dimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf.slice(1, 4).toString() === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) return null;
      const m = buf[o + 1];
      const len = buf.readUInt16BE(o + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
      o += 2 + len;
    }
  }
  return null;
}

/**
 * Insère une photo (paragraphe centré + légende) dans le .docx, juste après `apres` (un paragraphe) ou,
 * à défaut, à la fin du document. Ajoute l'image au fichier et ses déclarations (relation, type).
 */
export function insererPhotoDocx(zip: PizZip, xmlDoc: any, piece: { nom: string; chemin: string }, legende: string, apres: any | null, n: number, hauteurMax?: number): void {
  const buf = fs.readFileSync(piece.chemin);
  const dim = dimensions(buf);
  if (!dim) throw new Error(`Format d'image non pris en charge : ${piece.nom} (JPEG ou PNG attendu).`);
  const ext = dim && buf.slice(1, 4).toString() === 'PNG' ? 'png' : 'jpeg';
  const unique = `${Date.now().toString(36)}${n}`;
  const media = `media/gss_photo_${unique}.${ext}`;
  zip.file(`word/${media}`, buf);

  const relsNom = 'word/_rels/document.xml.rels';
  const rels = zip.file(relsNom)!.asText();
  const rid = `rIdGssPhoto${unique}`;
  zip.file(relsNom, rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${media}"/></Relationships>`));
  const ct = zip.file('[Content_Types].xml')!.asText();
  if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) {
    zip.file('[Content_Types].xml', ct.replace('<Types ', '<Types ').replace(/(<Types[^>]*>)/, `$1<Default Extension="${ext}" ContentType="image/${ext}"/>`));
  }

  // Taille : largeur du texte (15,5 cm) ou, dans un tableau, largeur de la cellule ; hauteur ≤ 11 cm (ou `hauteurMax`,
  // partie du cadre limitée en pages) ; proportions conservées.
  const { cx, cy } = tailleImageDocx(dim, apres, hauteurMax);
  const idDoc = 5000 + n + Math.floor(Math.random() * 1000);
  const nomXml = piece.nom.replace(/[<>&"]/g, '');
  const fragment = `<w:body xmlns:w="${W_NS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idDoc}" name="Photo ${idDoc}" descr="${nomXml}"/>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${idDoc}" name="${nomXml}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    + (legende ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${legende.replace(/[<>&]/g, '')}</w:t></w:r></w:p>` : '')
    + '</w:body>';
  const frag: any = new DOMParser().parseFromString(fragment, 'text/xml').documentElement;
  const noeuds = Array.from({ length: frag.childNodes.length }, (_, i) => frag.childNodes[i]).filter((x: any) => x.nodeType === 1);
  let parent: any, suivant: any;
  if (apres) { parent = apres.parentNode; suivant = apres.nextSibling; } else {
    parent = elements(xmlDoc, 'body')[0];
    suivant = Array.from({ length: parent.childNodes.length }, (_, i) => parent.childNodes[i]).reverse().find((x: any) => x.nodeType === 1 && x.localName === 'sectPr') || null;
  }
  for (const nd of noeuds) {
    const imp = xmlDoc.importNode(nd, true);
    if (suivant) parent.insertBefore(imp, suivant); else parent.appendChild(imp);
  }
}

/** Taille (EMU) d'une image insérée après `apres` : largeur du texte ou de la cellule, hauteur ≤ 11 cm et ≤ `hauteurMax`. */
function tailleImageDocx(dim: { w: number; h: number }, apres: any | null, hauteurMax?: number): { cx: number; cy: number } {
  const MAX_H = hauteurMax && hauteurMax > 0 ? Math.min(3960000, hauteurMax) : 3960000;
  let MAX_W = 5580000;
  let cellule = apres?.parentNode;
  while (cellule && cellule.localName !== 'tc') cellule = cellule.parentNode;
  const tcW = cellule ? elements(cellule, 'tcW')[0] : null;
  if (tcW && (tcW.getAttribute('w:type') || 'dxa') === 'dxa') {
    const largeur = Number(tcW.getAttribute('w:w')) * 635 - 250000;   // twips → EMU, moins les marges de cellule
    if (largeur > 1000000) MAX_W = Math.min(MAX_W, largeur);
  }
  let cx = MAX_W;
  let cy = Math.round(cx * dim.h / dim.w);
  if (cy > MAX_H) { cx = Math.round(cx * MAX_H / cy); cy = MAX_H; }
  return { cx, cy };
}

/** Hauteur (EMU) qu'aurait une image PNG ou JPEG insérée après `apres` (0 si format inconnu). */
export function hauteurImageDocx(buf: Buffer, apres: any | null): number {
  const dim = dimensions(buf);
  return dim ? tailleImageDocx(dim, apres).cy : 0;
}

/** Paragraphe qui contient le signet d'une réponse. */
export function paragrapheDuChamp(xmlDoc: any, cle: string): any | null {
  const b = elements(xmlDoc, 'bookmarkStart').find((x) => x.getAttribute('w:name') === cle);
  let n = b?.parentNode;
  while (n && n.localName !== 'p') n = n.parentNode;
  return n || null;
}

