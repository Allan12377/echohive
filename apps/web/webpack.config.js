const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("node:path");

module.exports = {
  entry: "./src/main.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].[contenthash].js",
    clean: true,
    publicPath: "/"
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      "@components": path.resolve(__dirname, "src/echohive/components"),
      "@pages": path.resolve(__dirname, "src/echohive/pages"),
      "@services": path.resolve(__dirname, "src/echohive/services"),
      "@types": path.resolve(__dirname, "src/echohive/types"),
      "@hooks": path.resolve(__dirname, "src/echohive/hooks"),
      "@store": path.resolve(__dirname, "src/echohive/store"),
      "@styles": path.resolve(__dirname, "src/echohive/styles")
    }
  },
  module: {
    rules: [
      { test: /\.tsx?$/, use: "ts-loader", exclude: /node_modules/ },
      { test: /\.s[ac]ss$/i, use: ["style-loader", "css-loader", "sass-loader"] }
    ]
  },
  plugins: [new HtmlWebpackPlugin({ template: "./src/index.html" })],
  devServer: {
    host: "0.0.0.0",
    port: Number(process.env.WEB_PORT ?? 3000),
    historyApiFallback: true,
    hot: true,
    proxy: [
      { context: ["/api"], target: process.env.API_PROXY_TARGET ?? "http://localhost:4000" },
      { context: ["/socket.io"], target: process.env.API_PROXY_TARGET ?? "http://localhost:4000", ws: true }
    ]
  }
};
