import html2pdf from 'html2pdf.js';

export interface PdfOptions {
    margin: number; // in mm
    filename: string;
    pageSize: 'a4' | 'letter';
    backgroundColor: string;
}

export const generatePdf = async (
    element: HTMLElement,
    options: PdfOptions
): Promise<void> => {
    const { margin, filename, pageSize, backgroundColor } = options;

    // Clone the element to avoid modifying the original
    const clone = element.cloneNode(true) as HTMLElement;

    // Apply background color to the clone
    clone.style.backgroundColor = backgroundColor;
    clone.style.padding = `${margin}mm`;
    clone.style.boxSizing = 'border-box';

    // Create a temporary container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = pageSize === 'a4' ? '210mm' : '8.5in';
    container.appendChild(clone);
    document.body.appendChild(container);

    const pdfOptions = {
        margin: margin,
        filename: filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: backgroundColor,
            logging: false,
        },
        jsPDF: {
            unit: 'mm',
            format: pageSize,
            orientation: 'portrait' as const,
        },
        pagebreak: {
            mode: ['avoid-all', 'css', 'legacy'],
            before: '.page-break-before',
            after: '.page-break-after',
            avoid: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'table', 'blockquote'],
        },
    };

    try {
        await html2pdf().set(pdfOptions).from(clone).save();
    } finally {
        // Clean up the temporary container
        document.body.removeChild(container);
    }
};

export default generatePdf;
