const UserAgent = require("user-agents");
const request = require("request");
const colors = require("colors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function fileHash(filename, algorithm = "md5") {
  return new Promise((resolve, reject) => {
    // Algorithm depends on availability of OpenSSL on platform
    // Another algorithms: 'sha1', 'md5', 'sha256', 'sha512' ...
    let shasum = crypto.createHash(algorithm);
    try {
      let s = fs.ReadStream(filename);
      s.on("data", function (data) {
        shasum.update(data);
      });
      // making digest
      s.on("end", function () {
        const hash = shasum.digest("hex");
        return resolve(hash);
      });
    } catch (error) {
      return reject("calc fail");
    }
  });
}

const cacheFilePath = path.resolve(__dirname, ".tinycache");
let cachedFiles = [];
try {
  fs.statSync(cacheFilePath);
  const files = fs.readFileSync(cacheFilePath, { encoding: "utf-8" });
  cachedFiles = files.split("\n").filter((item) => item !== "");
} catch (e) {
  // 缓存文件不存在
}

let compressedTotal = 0;
const { argv } = process;
const dirname = path.resolve(argv[2]);

const userAgent = new UserAgent();
const uaUsed = [];
function createUA() {
  let ua = userAgent.random().toString();
  if (uaUsed.includes(ua)) {
    return createUA();
  } else {
    uaUsed.push(ua);
    return ua;
  }
}

function compressImage(src) {
  try {
    fs.statSync(src);
  } catch (e) {
    return Promise.reject(colors.red("文件不存在！"));
  }
  return new Promise(function (resolve, reject) {
    fileHash(src).then((hash) => {
      if (cachedFiles.includes(hash)) {
        console.log(colors.green("图片已经是压缩文件"));
        resolve();
      } else {
        const headers = {
          "content-type": "image/png",
          "User-Agent": createUA(),
          accept: "*/*",
          authority: "tinypng.com",
          method: "POST",
          path: "/web/shrink",
          scheme: "https",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
          origin: "https://tinypng.com",
          referer: "https://tinypng.com",
        };
        const url = "https://tinypng.com/web/shrink";
        const data = fs.readFileSync(src);
        request.post(
          {
            url,
            headers,
            body: data,
          },
          function (err, res, body) {
            if (err) reject(err);
            const resJson = JSON.parse(body);
            if (resJson.output && resJson.output.url) {
              request.get(resJson.output.url, { encoding: "binary" }, function (
                error,
                response,
                content
              ) {
                if (error) reject(error);
                compressedTotal++;
                fs.writeFile(src, content, "binary", function (writeErr) {
                  if (writeErr) {
                    reject(writeErr);
                  } else {
                    console.log(
                      colors.cyan(src),
                      "压缩成功！",
                      colors.yellow(
                        `${(resJson.input.size / 1024).toFixed(2)}KB`
                      ),
                      "=>",
                      colors.green(
                        `${(resJson.output.size / 1024).toFixed(2)}KB`
                      ),
                      "压缩率：",
                      colors.cyan.underline(
                        (
                          ((resJson.input.size - resJson.output.size) * 100) /
                          resJson.input.size
                        ).toFixed(2) + "%"
                      )
                    );
                    fileHash(src)
                      .then((hash) => {
                        fs.appendFile(cacheFilePath, `${hash}\n`, function (
                          err
                        ) {
                          if (err) {
                            console.log(colors.red(err));
                          } else {
                            resolve();
                          }
                        });
                      })
                      .catch(() => {
                        reject(
                          `Compress Server Error: ${
                            resJson.unauthorized || ""
                          } ${resJson.message}`
                        );
                      });
                  }
                });
              });
            } else {
              reject(
                `Compress Server Error: ${resJson.unauthorized || ""} ${
                  resJson.message
                }`
              );
            }
          }
        );
      }
    });
  });
}

function getDirImages(dir) {
  const allFilesPath = [];
  const dirStats = fs.statSync(dir);
  if (dirStats.isDirectory()) {
    for (let name of fs.readdirSync(dir)) {
      const pathname = path.resolve(dir, name);
      allFilesPath.push(...getDirImages(pathname));
    }
  } else if (dirStats.isFile() && dir.match(/^.+\.(jpg|png)$/g)) {
    allFilesPath.push(dir);
  }
  return allFilesPath;
}

async function compressDir(dir) {
  const images = getDirImages(dir);
  const imagesTotal = images.length;
  for (let image of images) {
    console.log(colors.cyan("发现图片"), colors.cyan.underline(image));
    await compressImage(image)
      .then(function () {
        if (compressedTotal === imagesTotal) {
          console.log(
            colors.rainbow(`所有图片压缩完成，总计${compressedTotal}张`)
          );
        }
      })
      .catch(function (err) {
        console.log(colors.red(err));
        process.exit(-1);
      });
  }
}

compressDir(dirname);
