import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import menuRouter from "./menu";
import ownerRouter from "./owner";
import adminRouter from "./admin";
import adminAuthRouter from "./adminAuth";
import sensitiveAuthRouter from "./sensitiveAuth";
import adminExportRouter from "./adminExport";
import subscriptionRouter from "./subscriptions";
import storageRouter from "./storage";
import imagesRouter from "./images";
import paymentsRouter from "./payments";
import resourcesRouter from "./resources";
import whatsappBridgeRouter from "./whatsappBridge";
import screenshotInboxRouter from "./screenshotInbox";
import platformAnalyticsRouter from "./platformAnalytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminAuthRouter);
router.use(menuRouter);
router.use(ownerRouter);
router.use(adminRouter);
router.use(sensitiveAuthRouter);
router.use(adminExportRouter);
router.use(subscriptionRouter);
router.use(storageRouter);
router.use(imagesRouter);
router.use(paymentsRouter);
router.use(resourcesRouter);
router.use(whatsappBridgeRouter);
router.use(screenshotInboxRouter);
router.use(platformAnalyticsRouter);

export default router;
