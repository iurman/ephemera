import { router } from "./index";
import { dropRouter } from "./routers/drop";
import { authRouter } from "./routers/auth";

export const appRouter = router({
  drop: dropRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
