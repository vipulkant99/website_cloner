import puppeteer from "puppeteer";
import fs from "fs-extra";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

export async function cloneWebsite({ url, outputDir = "cloned-site" }) {
  let finalOutputDir = path.isAbsolute(outputDir)
    ? outputDir
    : path.join(process.cwd(), outputDir);

  console.log("final dirc is", finalOutputDir);

  if (!fs.existsSync(finalOutputDir)) {
    fs.mkdirSync(finalOutputDir, { recursive: true });
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  const html = await page.content();
  const $ = cheerio.load(html);

  const cssDir = path.join(finalOutputDir, "css");
  const imgDir = path.join(finalOutputDir, "images");
  const jsDir = path.join(finalOutputDir, "js");

  [cssDir, imgDir, jsDir].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  /* ---- CSS ---- */
  const cssLinks = $("link[rel='stylesheet']");
  // console.log(`Found ${cssLinks.length} CSS files`);
  for (let i = 0; i < cssLinks.length; i++) {
    const cssUrl = $(cssLinks[i]).attr("href");
    if (cssUrl) {
      try {
        const fullCssUrl = new URL(cssUrl, url).href;
        const { data } = await axios.get(fullCssUrl);
        const cssFileName =
          path.basename(cssUrl.split("?")[0]) || `style${i}.css`;
        const localCssPath = path.join(cssDir, cssFileName);
        fs.writeFileSync(localCssPath, data);
        $(cssLinks[i]).attr("href", `css/${cssFileName}`);
        // console.log(`✅ Saved CSS: ${cssFileName}`);
      } catch (err) {
        console.error(`❌ Failed to download CSS: ${cssUrl}`, err.message);
      }
    }
  }

  /* ---- Images ---- */
  const images = $("img");
  // console.log(`Found ${images.length} images`);
  let successful = 0,
    failed = 0;

  for (let i = 0; i < images.length; i++) {
    const $img = $(images[i]);
    const imgSrc = $img.attr("src");
    const imgSrcset = $img.attr("srcset");
    const imgDataSrc = $img.attr("data-src");

    if (imgSrc && imgSrc.startsWith("data:")) {
      // console.log(`⏭️  Skipping data URL image ${i + 1}`);
      continue;
    }

    let actualImageUrl = imgSrc;
    if (imgSrc && imgSrc.includes("/_next/image?url=")) {
      try {
        const params = new URLSearchParams(imgSrc.split("?")[1]);
        const enc = params.get("url");
        if (enc) actualImageUrl = decodeURIComponent(enc);
      } catch {
        /* ignore */
        // console.warn(
        //   `⚠️  Failed to decode Next.js image URL for image ${i + 1}`
        // );
      }
    }

    const sources = [
      actualImageUrl,
      imgSrc,
      imgDataSrc,
      imgSrcset?.split(",")[0]?.trim().split(" ")[0],
    ]
      .filter(Boolean)
      .filter((v, idx, arr) => arr.indexOf(v) === idx);

    let ok = false;
    for (const src of sources) {
      try {
        const fullImgUrl = new URL(src, url).href;
        const { data, headers } = await axios.get(fullImgUrl, {
          responseType: "arraybuffer",
          timeout: 10000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Referer: url,
          },
        });

        if (data.length) {
          let fileName = path.basename(src.split("?")[0]);
          if (!path.extname(fileName)) {
            const ct = headers["content-type"] || "";
            fileName = `image${i + 1}.${
              ct.includes("png")
                ? "png"
                : ct.includes("gif")
                ? "gif"
                : ct.includes("webp")
                ? "webp"
                : ct.includes("svg")
                ? "svg"
                : "jpg"
            }`;
          }

          let unique = fileName,
            counter = 1;
          while (fs.existsSync(path.join(imgDir, unique))) {
            const ext = path.extname(fileName);
            unique = `${path.basename(fileName, ext)}_${counter++}${ext}`;
          }

          fs.writeFileSync(path.join(imgDir, unique), data);
          $img
            .attr("src", `images/${unique}`)
            .removeAttr("srcset data-nimg data-src");
          successful++;
          ok = true;
          // console.log(
          //   `✅ Saved image: ${unique} (${(data.length / 1024).toFixed(1)}KB)`
          // );
          break;
        }
      } catch (e) {
        // console.log(`⚠️  Failed source ${src}: ${e.message}`);
      }
    }

    if (!ok) {
      failed++;
      console.error(`❌ All methods failed for image ${i + 1}`);
      $img.attr("alt", "Image failed to download");
    }
  }

  // console.log(`📊 Image summary: ${successful} successful, ${failed} failed`);

  /* ---- JS ---- */
  const jsScripts = $("script[src]");
  // console.log(`Found ${jsScripts.length} JS files`);
  for (let i = 0; i < jsScripts.length; i++) {
    const jsSrc = $(jsScripts[i]).attr("src");
    if (jsSrc) {
      try {
        const fullJsUrl = new URL(jsSrc, url).href;
        const { data } = await axios.get(fullJsUrl);
        const jsFileName =
          path.basename(jsSrc.split("?")[0]) || `script${i}.js`;
        const localPath = path.join(jsDir, jsFileName);
        fs.writeFileSync(localPath, data);
        $(jsScripts[i]).attr("src", `js/${jsFileName}`);
        // console.log(`✅ Saved JS: ${jsFileName}`);
      } catch (err) {
        console.error(`❌ Failed to download JS: ${jsSrc}`, err.message);
      }
    }
  }

  /* ---- Save HTML ---- */
  fs.writeFileSync(path.join(finalOutputDir, "index.html"), $.html());
  await browser.close();
  // console.log("🎉 Website cloned!");
  return "Site Cloned";
}

//cloneWebsite("https://code.visualstudio.com/", "vscode-clone");
