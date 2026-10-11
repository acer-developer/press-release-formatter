import { writeFileSync } from "fs";
import { northwindSample } from "../src/lib/note/samples/northwind";
import { renderNotePdf } from "../src/lib/pdf/render";
const charts = process.argv[3] === "charts";
writeFileSync(process.argv[2], await renderNotePdf({ ...northwindSample, options: { charts, dateMode: "date" } }));
