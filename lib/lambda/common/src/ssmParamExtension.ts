// https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html

import http from "http";

export const getSecureSsmParam = async (paramName: string): Promise<string> => {
  const options = {
    headers: {
      "X-Aws-Parameters-Secrets-Token": process.env.AWS_SESSION_TOKEN,
    },
  };
  const url =
    "http://localhost:2773/systemsmanager/parameters/get?name=" +
    paramName +
    "&withDecryption=true";

  return new Promise((resolve, reject) => {
    http
      .get(url, options, (res) => {
        const statusCode = res.statusCode;
        let body = "";
        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          if (statusCode === 200) {
            resolve(JSON.parse(body).Parameter.Value);
          } else {
            reject(body);
          }
        });
      })
      .on("error", (e) => {
        reject(e.message);
      });
  });
};
