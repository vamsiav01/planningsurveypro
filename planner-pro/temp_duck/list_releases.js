const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { NodeHttpHandler } = require("@smithy/node-http-handler");

async function list() {
  const s3 = new S3Client({
    region: "us-west-2",
    requestHandler: new NodeHttpHandler(),
    // Anonymous access
    credentials: { accessKeyId: "", secretAccessKey: "" },
    signer: { sign: async (request) => request }
  });

  try {
    const cmd = new ListObjectsV2Command({
      Bucket: "overturemaps-us-west-2",
      Prefix: "release/",
      Delimiter: "/"
    });
    const data = await s3.send(cmd);
    console.log(data.CommonPrefixes.map(p => p.Prefix));
  } catch (e) {
    console.error(e);
  }
}
list();
