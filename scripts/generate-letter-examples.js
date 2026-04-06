/* eslint-disable no-console */
const fs = require('fs/promises');
const path = require('path');

const { getKopConfig } = require('../src/lib/kopConfig');
const { renderLetterHtml } = require('../src/lib/renderLetter');
const { generatePdfBuffer } = require('../src/lib/pdf');

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function sampleBase() {
  return {
    font: 'calibri',
    fontCustom: '',
    fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif',
    fontSizePt: 12,
    lineHeight: 1.55,
    paragraphSpacingPt: 0,
    sectionSpacingPt: 0,
    place: 'Bandung',
    date: nowIsoDate(),
    formattedDate: '',
    number: '',
    attachment: '-',
    subject: '',
    recipient: '',
    recipientAddress: '',
    recipientAddressHtml: '',
    body: '',
    bodyHtml: '',
    closing: 'Demikian surat tugas ini diterbitkan agar dapat dilaksanakan dengan penuh tanggung jawab.',
    signatoryName: 'Prof. Ir. Agus Pratondo, S.T., M.T., Ph.D.',
    signatoryTitle: 'Ketua CoE Artificial Intelligence for Learning and Optimization (AILO)',
    signatoryNip: '09770043',
    tableRowsRaw: '',
    detailsRaw: '',
    signatures: [],
  };
}

function examples() {
  const base = sampleBase();

  return [
    {
      key: 'default',
      filename: '01-default',
      letter: {
        ...base,
        template: 'DEFAULT',
        number: '001/AILO/IV/2026',
        subject: 'Contoh Surat (Default)',
        recipient: 'Yth. Bapak/Ibu Pimpinan',
        recipientAddress: 'Universitas Telkom\nBandung',
        recipientAddressHtml: '<div><strong>Universitas Telkom</strong><br>Bandung</div>',
        bodyHtml: [
          '<div>Dengan hormat,</div>',
          '<div style="margin-top:8px">Ini adalah <strong>contoh</strong> surat default dari sistem Web Mailer.</div>',
          '<div style="margin-top:8px">Silakan ubah isi sesuai kebutuhan.</div>',
          '<ul style="margin-top:8px">'
            + '<li><em>Bold/Italic</em> bisa dipakai</li>'
            + '<li>List juga bisa</li>'
            + '</ul>',
          '<div style="margin-top:8px">Terima kasih.</div>',
        ].join(''),
        closing: 'Hormat kami,',
      },
    },
    {
      key: 'surat-tugas',
      filename: '02-surat-tugas',
      letter: {
        ...base,
        template: 'SURAT_TUGAS',
        number: '110/SDM4/AI-Center/2025',
        body: [
          'Pada hari Senin, tanggal 27 Oktober 2025 bertempat di Universitas Telkom, saya yang bertanda tangan di bawah ini:',
        ].join('\n'),
        tableRowsRaw: [
          'Agnes Gabriela Putri Winata|103062300117',
          'Muhammad Raia Pratama Putra Wibowo|103062300043',
          'David Chandra|103062330056',
        ].join('\n'),
        detailsRaw: [
          'Tanggal: 28 – 30 Oktober 2025',
          'Tempat: Jakarta International Expo – Kemayoran',
        ].join('\n'),
      },
    },
    {
      key: 'panduan',
      filename: '03-surat-tugas-panduan',
      letter: {
        ...base,
        template: 'SURAT_TUGAS_PANDUAN',
        number: '030/SDM4/AI-Center/2025',
        body: [
          'Berdasarkan surat undangan nomor 0573/H3/SK.02.01/2025 perihal Penelaahan Panduan Pemanfaatan Kecerdasan Artifisial untuk Guru pada PAUD/SMK, maka yang bertanda tangan di bawah ini:',
        ].join('\n'),
        tableRowsRaw: ['Thomhert Suprapto Siadari, Ph.D.|23880005|Fakultas Teknik Elektro'].join('\n'),
        detailsRaw: [
          'Hari, tanggal: Kamis s.d. Sabtu, 12 s.d. 14 Juni 2025',
          'Waktu: 09.00 WIB s.d selesai',
          'Media: Pertemuan Virtual via Zoom Meeting',
          'Acara: Penelaahan Panduan Pemanfaatan Kecerdasan Artifisial',
        ].join('\n'),
      },
    },
    {
      key: 'tenaga-ahli',
      filename: '04-surat-tugas-tenaga-ahli',
      letter: {
        ...base,
        template: 'SURAT_TUGAS_TENAGA_AHLI',
        number: '054/SDM4/AI-Center/2024',
        signatoryName: 'Prof. Suyanto',
        signatoryTitle: 'Ketua CoE Artificial Intelligence for Learning and Optimization (AILO)',
        signatoryNip: '99740057',
        body: [
          'Berdasarkan surat undangan nomor 01057/BK/05/2024/36/05 perihal Undangan sebagai Tenaga Ahli Delegasi RI pada Indonesia-US Digital Technology Dialogue di Amerika Serikat, maka yang bertanda tangan di bawah ini:',
        ].join('\n'),
        tableRowsRaw: ['Thomhert Suprapto Siadari, Ph.D.|23880005|Fakultas Teknik Elektro'].join('\n'),
        detailsRaw: ['Tanggal: 11 – 13 Juni 2024', 'Tempat: San Francisco dan Silicon Valley'].join('\n'),
      },
    },
    {
      key: 'undangan',
      filename: '05-surat-tugas-undangan',
      letter: {
        ...base,
        template: 'SURAT_TUGAS_UNDANGAN',
        number: '012/SDM4/AI-Center/2025',
        body: [
          'Berdasarkan surat undangan nomor B-77/DJED.3/PI.02.04/04/2025 perihal Undangan Rapat Komdigi, maka yang bertanda tangan di bawah ini:',
        ].join('\n'),
        tableRowsRaw: ['Thomhert Suprapto Siadari, Ph.D.|23880005|Fakultas Teknik Elektro'].join('\n'),
        detailsRaw: [
          'Hari, tanggal: Kamis, 8 Mei 2025',
          'Waktu: 09.00 WIB s.d selesai',
          'Media: Ruang Rapat Hotel Aryaduta Menteng, Jakarta Pusat',
          'Acara: Focus Group Discussion (FGD) Penyusunan Peta Jalan AI',
        ].join('\n'),
      },
    },
    {
      key: 'in-house-training',
      filename: '06-surat-tugas-in-house-training',
      letter: {
        ...base,
        template: 'SURAT_TUGAS_IN_HOUSE_TRAINING',
        number: '020/SDM4/AI-Center/2024',
        body: [
          'Sehubungan dengan akan dilaksanakannya In-House Training Tematik Digitalisasi untuk Kebijakan Utama Bank Indonesia Tahap I Tahun 2024 oleh CoE Artificial Intelligence for Learning and Optimization (AILO). Bersamaan dengan kegiatan tersebut maka, yang bertanda tangan di bawah ini:',
        ].join('\n'),
        tableRowsRaw: [
          'Dr. Eng. Alfian Akbar Gozali|Fakultas Informatika',
          'Dr. Andry Alamsyah|Fakultas Ekonomi dan Bisnis',
          'Isman Kurniawan, Ph.D.|Fakultas Informatika',
        ].join('\n'),
        detailsRaw: [
          'Catatan: Silakan lengkapi detail tanggal/tempat sesuai kebutuhan.',
        ].join('\n'),
      },
    },
  ];
}

async function main() {
  const outDir = path.join(__dirname, '..', 'public', 'examples');
  await fs.mkdir(outDir, { recursive: true });

  const kop = await getKopConfig();

  const items = examples();
  for (const item of items) {
    const html = await renderLetterHtml({ kop, letter: item.letter, withChrome: false });
    const htmlPath = path.join(outDir, `${item.filename}.html`);
    await fs.writeFile(htmlPath, html, 'utf8');

    const pdf = await generatePdfBuffer(html, { repeatingHeaderFooter: true, kop });
    const pdfPath = path.join(outDir, `${item.filename}.pdf`);
    await fs.writeFile(pdfPath, pdf);

    console.log(`[ok] ${path.basename(htmlPath)} + ${path.basename(pdfPath)}`);
  }

  console.log(`\nGenerated examples in: ${outDir}`);
  console.log('You can open: http://localhost:3000/examples/01-default.html (after running the server)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
