/** The part of qrcode-generator (Kazuhiko Arase, MIT) the app uses: a QR code's dark modules. */
export interface QR { addData(data: string, mode?: string): void; make(): void; getModuleCount(): number; isDark(row: number, col: number): boolean }
export default function qrcode(typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): QR;
