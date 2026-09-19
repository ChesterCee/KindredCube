const fs = require("node:fs");
const path = require("node:path");

const outputDirectory = path.resolve(process.argv[2] || "dist");
const indexPath = path.join(outputDirectory, "index.html");

if (!fs.existsSync(indexPath)) {
  throw new Error(`Web export not found at ${indexPath}`);
}

let html = fs.readFileSync(indexPath, "utf8");

const headMarkup = `
    <meta name="application-name" content="KindredCube" />
    <meta name="theme-color" content="#F7F1E7" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="KindredCube" />
    <meta name="mobile-web-app-capable" content="yes" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />`;

if (!html.includes('rel="manifest"')) {
  html = html.replace("</head>", `${headMarkup}\n  </head>`);
}

const serviceWorkerMarkup = `
  <script>
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("/sw.js").catch(function () {});
      });
    }
  </script>`;

if (!html.includes('serviceWorker.register("/sw.js")')) {
  html = html.replace("</body>", `${serviceWorkerMarkup}\n</body>`);
}

fs.writeFileSync(indexPath, html);
console.log(`Configured installable KindredCube PWA in ${outputDirectory}`);
