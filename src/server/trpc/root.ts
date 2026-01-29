import { router } from "./index";
import { dropRouter } from "./routers/drop";
import { authRouter } from "./routers/auth";
import { statsRouter } from "./routers/stats";

export const appRouter = router({
  drop: dropRouter,
  auth: authRouter,
  stats: statsRouter,
});

export type AppRouter = typeof appRouter;
