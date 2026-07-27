const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { NodeHttpHandler } = require("@smithy/node-http-handler");

async function list() {
  const s3 = new S3Client({
    region: "us-west-2",
    requestHandler: new NodeHttpHandler(),
    credentials: { accessKeyId: "", secretAccessKey: "" },
    signer: { sign: async (request) => request }
  });

  try {
    const cmd = new ListObjectsV2Command({
      Bucket: "overturemaps-extras-us-west-2",
      Prefix: "tiles/2026-07-22.0/"
    });
    const data = await s3.send(cmd);
    console.log(data.Contents ? data.Contents.map(p => p.Key) : "No objects");
  } catch (e) {
    console.error(e);
  }
}
list();
