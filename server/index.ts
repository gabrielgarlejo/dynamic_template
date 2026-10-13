import express from "express";
import { RENDER_PORT } from "../shared/template";
import { ParseError, parseRenderRequest } from "./parseRequest";
import { renderDocx } from "./renderDocx";

const app = express();
app.use(express.json({ limit: "8mb" }));

app.post("/api/render", async (req, res) => {
  try {
    const request = parseRenderRequest(req.body);
    const buffer = await renderDocx(request);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", 'attachment; filename="template.docx"');
    res.end(buffer);
  } catch (error) {
    if (error instanceof ParseError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Could not render the document." });
  }
});

app.listen(RENDER_PORT, "127.0.0.1", () => {
  console.log(`render server http://127.0.0.1:${RENDER_PORT}`);
});
