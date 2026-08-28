import { defineRoom, defineServer } from "colyseus";
import { ROOM_NAME } from "@coup/shared";
import { GameRoom } from "./rooms/GameRoom.js";

export const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(GameRoom),
  },
});

export default server;
