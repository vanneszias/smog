import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { z } from "zod";
import { adminProcedure } from "../index";
import { convexClient } from "../lib/convex";

export const adminRouter = {
  // Verify user is admin
  verifyAdmin: adminProcedure.handler(async ({ context }) => {
    const user = await convexClient.query(api.users.getUserByWorkOSId, {
      workosId: context.workosId,
    });
    return user;
  }),

  // User management
  users: {
    list: adminProcedure
      .input(
        z.object({
          limit: z.number().optional(),
          cursor: z.string().optional(),
        })
      )
      .handler(async ({ input }) => {
        const result = await convexClient.query(api.users.listAllUsers, input);
        return result;
      }),

    listAdmins: adminProcedure.handler(async () => {
      const admins = await convexClient.query(api.users.listAdmins);
      return admins;
    }),

    updateRole: adminProcedure
      .input(
        z.object({
          userId: z.string() as z.ZodType<Id<"users">>,
          role: z.enum(["user", "admin"]),
        })
      )
      .handler(async ({ input }) => {
        await convexClient.mutation(api.users.updateUserRole, input);
        return { success: true };
      }),
  },

  // Gesture management
  gestures: {
    listAll: adminProcedure
      .input(
        z.object({
          limit: z.number().optional(),
          includeInactive: z.boolean().optional(),
        })
      )
      .handler(async ({ input }) => {
        const gestures = await convexClient.query(api.gestures.listAll, input);
        return gestures;
      }),

    update: adminProcedure
      .input(
        z.object({
          gestureId: z.string() as z.ZodType<Id<"gestures">>,
          name: z.string().optional(),
          categoryIds: z
            .array(z.string() as z.ZodType<Id<"categories">>)
            .optional(),
          playbackId: z.string().optional(),
          concept: z.array(z.string()).optional(),
          info: z.string().optional(),
          isActive: z.boolean().optional(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(api.gestures.updateGesture, input);

        // Log action
        await convexClient.mutation(api.adminLogs.logAction, {
          userId: context.userId,
          action: "update_gesture",
          targetId: input.gestureId,
          targetType: "gesture",
          metadata: input,
        });

        return { success: true };
      }),

    bulkUpdate: adminProcedure
      .input(
        z.object({
          gestureIds: z.array(z.string() as z.ZodType<Id<"gestures">>),
          updates: z.object({
            isActive: z.boolean().optional(),
            categoryIds: z
              .array(z.string() as z.ZodType<Id<"categories">>)
              .optional(),
          }),
        })
      )
      .handler(async ({ input, context }) => {
        const result = await convexClient.mutation(
          api.gestures.bulkUpdate,
          input
        );

        // Log action
        await convexClient.mutation(api.adminLogs.logAction, {
          userId: context.userId,
          action: "bulk_update_gestures",
          targetId: input.gestureIds.join(","),
          targetType: "gesture",
          metadata: { count: result.updated, updates: input.updates },
        });

        return result;
      }),

    toggleActive: adminProcedure
      .input(
        z.object({
          gestureId: z.string() as z.ZodType<Id<"gestures">>,
        })
      )
      .handler(async ({ input, context }) => {
        const newStatus = await convexClient.mutation(
          api.gestures.toggleActive,
          input
        );

        // Log action
        await convexClient.mutation(api.adminLogs.logAction, {
          userId: context.userId,
          action: "toggle_gesture_active",
          targetId: input.gestureId,
          targetType: "gesture",
          metadata: { isActive: newStatus },
        });

        return { success: true, isActive: newStatus };
      }),

    create: adminProcedure
      .input(
        z.object({
          name: z.string(),
          categoryIds: z.array(z.string() as z.ZodType<Id<"categories">>),
          playbackId: z.string(),
          concept: z.array(z.string()),
          info: z.string(),
          isActive: z.boolean().optional(),
        })
      )
      .handler(async ({ input, context }) => {
        const gestureId = await convexClient.mutation(
          api.gestures.create,
          input
        );

        // Log action
        await convexClient.mutation(api.adminLogs.logAction, {
          userId: context.userId,
          action: "create_gesture",
          targetId: gestureId,
          targetType: "gesture",
          metadata: input,
        });

        return { gestureId };
      }),
  },

  // Sponsorship management
  sponsorships: {
    listAll: adminProcedure
      .input(
        z.object({
          status: z.string().optional(),
          limit: z.number().optional(),
        })
      )
      .handler(async ({ input }) => {
        const sponsorships = await convexClient.query(
          api.sponsorships.listAll,
          input
        );
        return sponsorships;
      }),

    listPendingApproval: adminProcedure.handler(async () => {
      const sponsorships = await convexClient.query(
        api.sponsorships.listPendingApproval
      );
      return sponsorships;
    }),

    approve: adminProcedure
      .input(
        z.object({
          sponsorshipId: z.string() as z.ZodType<Id<"sponsorships">>,
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(api.sponsorships.approve, {
          sponsorshipId: input.sponsorshipId,
          adminUserId: context.userId,
        });

        // Log action
        await convexClient.mutation(api.adminLogs.logAction, {
          userId: context.userId,
          action: "approve_sponsorship",
          targetId: input.sponsorshipId,
          targetType: "sponsorship",
        });

        return { success: true };
      }),

    reject: adminProcedure
      .input(
        z.object({
          sponsorshipId: z.string() as z.ZodType<Id<"sponsorships">>,
          reason: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(api.sponsorships.reject, {
          sponsorshipId: input.sponsorshipId,
          adminUserId: context.userId,
          reason: input.reason,
        });

        // Log action
        await convexClient.mutation(api.adminLogs.logAction, {
          userId: context.userId,
          action: "reject_sponsorship",
          targetId: input.sponsorshipId,
          targetType: "sponsorship",
          metadata: { reason: input.reason },
        });

        return { success: true };
      }),

    forceExpire: adminProcedure
      .input(
        z.object({
          sponsorshipId: z.string() as z.ZodType<Id<"sponsorships">>,
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(api.sponsorships.forceExpire, {
          sponsorshipId: input.sponsorshipId,
          adminUserId: context.userId,
        });

        // Log action
        await convexClient.mutation(api.adminLogs.logAction, {
          userId: context.userId,
          action: "force_expire_sponsorship",
          targetId: input.sponsorshipId,
          targetType: "sponsorship",
        });

        return { success: true };
      }),

    getById: adminProcedure
      .input(
        z.object({
          id: z.string() as z.ZodType<Id<"sponsorships">>,
        })
      )
      .handler(async ({ input }) => {
        const sponsorship = await convexClient.query(
          api.sponsorships.getById,
          input
        );
        return sponsorship;
      }),
  },

  // Admin logs
  logs: {
    getRecent: adminProcedure
      .input(
        z.object({
          limit: z.number().optional(),
        })
      )
      .handler(async ({ input }) => {
        const logs = await convexClient.query(api.adminLogs.getRecent, input);
        return logs;
      }),

    getByAction: adminProcedure
      .input(
        z.object({
          action: z.string(),
          limit: z.number().optional(),
        })
      )
      .handler(async ({ input }) => {
        const logs = await convexClient.query(api.adminLogs.getByAction, input);
        return logs;
      }),

    getByTarget: adminProcedure
      .input(
        z.object({
          targetType: z.string(),
          targetId: z.string(),
        })
      )
      .handler(async ({ input }) => {
        const logs = await convexClient.query(api.adminLogs.getByTarget, input);
        return logs;
      }),
  },
};
