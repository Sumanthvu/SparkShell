import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { createNewChat, getUserChats, getChatMessages, sendMessage } from "../controllers/chat.controller.js";
import {
	getSharedChats,
	getChatCollaborators,
	sendChatInvitation,
	getInboxInvitations,
	respondToInvitation,
} from "../controllers/collaboration.controller.js";

const router = Router();
router.use(verifyJWT);

router.route("/").post(createNewChat).get(getUserChats);
router.route("/shared").get(getSharedChats);
router.route("/send").post(sendMessage);
router.route("/invitations/inbox").get(getInboxInvitations);
router.route("/invitations/:inviteId/respond").post(respondToInvitation);
router.route("/:chatId/invitations").post(sendChatInvitation);
router.route("/:chatId/collaborators").get(getChatCollaborators);
router.route("/:chatId").get(getChatMessages);

export default router;