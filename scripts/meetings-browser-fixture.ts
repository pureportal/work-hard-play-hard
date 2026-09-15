import { MediaConnection, type MediaStreams } from "../apps/client/src/media-connection";
import type { ClientCommand, ServerEvent } from "../packages/shared/src/index";

declare global {
  var meetingCheck: {
    events: ServerEvent[];
    connection: MediaConnection | undefined;
    streams: MediaStreams;
    captures: MediaStream[];
    socket: WebSocket;
    send: (command: ClientCommand) => void;
    capture: () => Promise<void>;
    share: () => void;
    stopSharing: () => void;
  };
}

const socket = new WebSocket(`${location.origin.replace("http", "ws")}/v1/realtime?floorId=floor-studio`);
const send = (command: ClientCommand) => { socket.send(JSON.stringify(command)); };
const videoSources = new Map<MediaStream, { canvas: HTMLCanvasElement; timer: number }>();

function captureVideo(color: string): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  canvas.hidden = true;
  document.body.append(canvas);
  const context = canvas.getContext("2d")!;
  let frame = 0;
  const timer = window.setInterval(() => {
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(frame++ % 600, 100, 40, 40);
  }, 100);
  const stream = canvas.captureStream(10);
  videoSources.set(stream, { canvas, timer });
  return stream;
}

function stopCapture(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
  const source = videoSources.get(stream);
  if (source) {
    window.clearInterval(source.timer);
    source.canvas.remove();
    videoSources.delete(stream);
  }
}

const cleanup = () => {
  globalThis.meetingCheck.connection?.close();
  globalThis.meetingCheck.connection = undefined;
  for (const stream of globalThis.meetingCheck.captures) stopCapture(stream);
  globalThis.meetingCheck.streams = {};
};

globalThis.meetingCheck = {
  events: [], connection: undefined, streams: {}, captures: [], socket, send,
  async capture() {
    const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    const camera = captureVideo("#3366cc");
    globalThis.meetingCheck.captures.push(microphone, camera);
    globalThis.meetingCheck.streams = { ...globalThis.meetingCheck.streams, microphone, camera };
    globalThis.meetingCheck.connection!.setStreams(globalThis.meetingCheck.streams);
  },
  share() {
    const screen = captureVideo("#ff4400");
    screen.addTrack(globalThis.meetingCheck.streams.microphone!.getAudioTracks()[0]!.clone());
    globalThis.meetingCheck.captures.push(screen);
    globalThis.meetingCheck.streams = { ...globalThis.meetingCheck.streams, screen };
    globalThis.meetingCheck.connection!.setStreams(globalThis.meetingCheck.streams);
  },
  stopSharing() {
    if (globalThis.meetingCheck.streams.screen) stopCapture(globalThis.meetingCheck.streams.screen);
    delete globalThis.meetingCheck.streams.screen;
    globalThis.meetingCheck.connection!.setStreams(globalThis.meetingCheck.streams);
  },
};

socket.addEventListener("message", ({ data }) => {
  const event = JSON.parse(String(data)) as ServerEvent;
  globalThis.meetingCheck.events.push(event);
  if (event.type === "meeting.joined") {
    cleanup();
    const connection = new MediaConnection(event.session, (command) => { send(command); return true; });
    globalThis.meetingCheck.connection = connection;
    connection.start();
  } else if (event.type === "meeting.left" && event.sessionId === globalThis.meetingCheck.connection?.getSnapshot().session.sessionId) {
    cleanup();
  } else {
    globalThis.meetingCheck.connection?.handle(event);
  }
});
socket.addEventListener("close", cleanup);
