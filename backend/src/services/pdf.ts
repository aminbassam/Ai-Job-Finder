function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "")
    .replace(/\t/g, "    ");
}

function normalizeContent(value: string): string[] {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n")
    .flatMap((line) => {
      const trimmed = line.replace(/\s+$/g, "");
      if (!trimmed) return [""];

      const chunks: string[] = [];
      let current = trimmed;
      while (current.length > 95) {
        chunks.push(current.slice(0, 95));
        current = current.slice(95);
      }
      chunks.push(current);
      return chunks;
    });
}

export function generateSimplePdf(title: string, content: string): Buffer {
  const lines = [title.trim(), "", ...normalizeContent(content)];
  const contentStream: string[] = ["BT", "/F1 10 Tf", "50 792 Td", "14 TL"];

  lines.forEach((line, index) => {
    const escaped = escapePdfText(line);
    if (index === 0) {
      contentStream.push(`/F1 16 Tf (${escaped}) Tj`);
      contentStream.push("/F1 10 Tf");
    } else {
      contentStream.push("T*");
      contentStream.push(`(${escaped}) Tj`);
    }
  });

  contentStream.push("ET");
  const streamBody = contentStream.join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj",
    `5 0 obj\n<< /Length ${Buffer.byteLength(streamBody, "utf8")} >>\nstream\n${streamBody}\nendstream\nendobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}
