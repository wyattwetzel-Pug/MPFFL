import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";

/*
 * The default share card, inherited by every page that doesn't render its
 * own: the tree on the dark house style, so a pasted REPLACE-WITH-YOUR-DOMAIN.example link looks
 * like the league instead of a bare URL.
 */
export const alt = "MPFFL Fantasy Football League";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  const logo = readFileSync(join(process.cwd(), "public", "mpffl-logo-white.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        { }
        <img src={src} alt="" width={180} height={180} />
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>MPFFL</div>
        <div style={{ fontSize: 30, color: "#a1a1aa" }}>
          Fantasy Football League · Est. 1987
        </div>
      </div>
    ),
    size
  );
}
