/**
 * Les imports CSS (`import "./mp-skin.css"`) ne veulent rien dire pour Jest :
 * il les parserait comme du JS. Mappé sur ce module vide dans jest.config.ts,
 * ce qui laisse les composants qui portent leur feuille de style testables.
 */
export default {};
