import { notFound, redirect } from "next/navigation";
import { isValidRoomName, toRoomSlug } from "@/lib/rooms";
import RoomView from "./RoomView";

// The URL path is the room name: /team-standup is the room "team-standup".
export default async function RoomPage({ params }: PageProps<"/[room]">) {
  const { room } = await params;
  const name = toRoomSlug(decodeURIComponent(room));
  if (!isValidRoomName(name)) notFound();
  // e.g. "/my%20room" -> "/my-room"
  if (name !== room) redirect(`/${name}`);
  return <RoomView room={name} />;
}
