import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "10Router - AI Infrastructure Management",
    short_name: "10Router",
    description:
      "One endpoint for all your AI providers. Manage keys, monitor usage, and scale effortlessly.",
    start_url: "/",
    display: "standalone",
    background_color: "#F2F9F4",
    theme_color: "#F2F9F4",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
