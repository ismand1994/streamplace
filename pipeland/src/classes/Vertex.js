
import ffmpeg from "fluent-ffmpeg";
import stream from "stream";

import SK from "../sk";
import mpegts from "../mpegts-stream";
import Base from "./Base";

export default class Vertex extends Base {
  constructor({id, broadcast}) {
    super();
    this.id = id;
    this.broadcast = broadcast;
    this.info("initializing");

    this.pipes = {};

    // We probably need one of these.
    this.mpegts = mpegts();
    this.mpegts.resume();

    // Watch my vertex, so I can respond appropriately.
    SK.vertices.watch({id: this.id})

    .then((docs) => {
      this.doc = docs[0];
      this.info("Got initial pull.");
      this.init();
    })

    .catch((err) => {
      this.error("Error on initial pull", err);
    });
  }

  getPipe(name) {
    if (this.pipes[name]) {
      return this.pipes[name];
    }
    throw new Error(`Vertex ${this.id} doesn't have a pipe named ${name}`);
  }

  /**
   * Get a node-fluent-ffmpeg instance that does stuff we like
   */
  ffmpeg() {
    let logCounter = 0;
    return ffmpeg()

    .outputOptions([

    ])

    .on("error", (err, stdout, stderr) => {
      this.error("ffmpeg error", {err, stdout, stderr});
    })

    .on("codecData", (data) => {
      this.info("ffmpeg codecData", data);
    })

    .on("end", () => {
      this.info("ffmpeg end");
    })

    .on("progress", (data) => {
      if (logCounter === 0) {
        this.info(data);
      }
      logCounter = (logCounter + 1) % 15;
    })

    .on("start", (command) => {
      this.info("ffmpeg start: " + command);
    });
  }
}

class RTMPInputVertex extends Vertex {
  constructor({id}) {
    super({id});
    this.pipes.default = this.mpegts;
  }

  init() {
    this.inputStream = this.ffmpeg()
      .input(this.doc.rtmp.url)
      .size("1280x720")
      .autopad("black")
      .inputFormat("flv")
      .outputOptions(["-bsf:v h264_mp4toannexb"])
      .videoCodec("libx264")
      .audioCodec("libmp3lame")
      .outputOptions([
        "-preset ultrafast",
        "-tune zerolatency",
        "-x264opts keyint=5:min-keyint=",
        "-pix_fmt yuv420p",
      ])
      .outputFormat("mpegts")
      .pipe(this.mpegts);

    // We want it to start consuming data even if no arcs are listening yet. Fire away.
    this.inputStream.resume();
  }
}

class RTMPOutputVertex extends Vertex {
  constructor({id}) {
    super({id});
    this.pipes.default = new stream.PassThrough();
  }

  init() {
    this.outputStream = this.ffmpeg()
      .input(this.pipes.default)
      .inputOptions([
        "-fflags +ignidx",
        "-fflags +igndts",
        "-fflags +discardcorrupt",
      ])
      .inputFormat("mpegts")
      // .inputFormat("ismv")
      .audioCodec("aac")
      .videoCodec("copy")
      // .outputOptions([
      //   "-fflags +genpts",
      //   "-vsync drop",
      // ])
      .outputFormat("flv")
      .videoCodec("libx264")
      .save(this.doc.rtmp.url);
      // .inputFormat("flv")
      // .outputOptions(["-bsf:v h264_mp4toannexb"])
      // .audioCodec("libmp3lame")
      // .outputOptions([
      //   "-preset ultrafast",
      //   "-tune zerolatency",
      //   "-x264opts keyint=5:min-keyint="
      // ])
      // .outputFormat("mpegts")
      // .stream();

    // We want it to start consuming data even if no arcs are listening yet. Fire away.
    // this.inputStream.resume();
  }
}

Vertex.create = function(params) {
  const {id, type} = params;
  if (type === "RTMPInput") {
    return new RTMPInputVertex(params);
  }
  else if (type === "RTMPOutput") {
    return new RTMPOutputVertex(params);
  }
  else {
    throw new Error(`Unknown Vertex Type: ${type}`);
  }
};
