/**
 * FocusFlow & Finance — Graph Studio Client-Side Export Utilities
 * Exports SVG elements to high-resolution PNGs and data rows to CSV.
 */

/**
 * Downloads tabular data as a clean CSV file.
 */
export function exportDatasetToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const sanitize = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvLines: string[] = [];
  csvLines.push(headers.map(sanitize).join(','));

  for (const row of rows) {
    csvLines.push(row.map(sanitize).join(','));
  }

  const csvContent = csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Renders an SVGSVGElement onto an HTML5 canvas and downloads it as a high-resolution PNG.
 */
export function exportSvgToPng(
  svgElement: SVGSVGElement,
  filename: string,
  scale = 2
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const bbox = svgElement.getBoundingClientRect();
      const width = (bbox.width || 800) * scale;
      const height = (bbox.height || 400) * scale;

      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgElement);

      // Ensure xmlns is present
      if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      // Convert CSS variables to static colors or ensure dark background fill
      const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to create canvas 2D context'));
            return;
          }

          // Background fill for clean contrast
          ctx.fillStyle = '#0f172a'; // Deep slate default background for exported graphics
          ctx.fillRect(0, 0, width, height);

          ctx.drawImage(image, 0, 0, width, height);
          URL.revokeObjectURL(url);

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Canvas to Blob conversion failed'));
              return;
            }
            const pngUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = pngUrl;
            link.setAttribute('download', filename.endsWith('.png') ? filename : `${filename}.png`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(pngUrl);
            resolve();
          }, 'image/png');
        } catch (err) {
          reject(err);
        }
      };

      image.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };

      image.src = url;
    } catch (err) {
      reject(err);
    }
  });
}
