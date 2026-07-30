import { router } from "./index";
import { dropRouter } from "./routers/drop";
import { authRouter } from "./routers/auth";
import { statsRouter } from "./routers/stats";
import { adminRouter } from "./routers/admin";

export const appRouter = router({
  drop: dropRouter,
  auth: authRouter,
  stats: statsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
