const SAMPLE_WIDTH = 320;
const SAMPLE_HEIGHT = 120;

export function createSampleImage(): {
  dataBase64: string;
  naturalWidth: number;
  naturalHeight: number;
} {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not available");
  }

  ctx.fillStyle = "#1e3a8a";
  ctx.fillRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(18, 18, SAMPLE_WIDTH - 36, SAMPLE_HEIGHT - 36);
  ctx.fillStyle = "#1e3a8a";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Epang", SAMPLE_WIDTH / 2, SAMPLE_HEIGHT / 2);

  const dataUrl = canvas.toDataURL("image/png");
  const dataBase64 = dataUrl.split(",")[1];
  if (!dataBase64) {
    throw new Error("Could not create the sample image");
  }

  return {
    dataBase64,
    naturalWidth: SAMPLE_WIDTH,
    naturalHeight: SAMPLE_HEIGHT,
  };
}
