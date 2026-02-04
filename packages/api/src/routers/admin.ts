import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { z } from "zod";
import { adminProcedure } from "../index";
import { convexClient } from "../lib/convex";
import {
  createMuxDirectUpload,
  getAssetStatus,
  getMuxUploadStatus,
  listMuxAssets,
} from "../lib/mux";

export const adminRouter = {
  // Mux video management
  mux: {
    listAssets: adminProcedure
      .input(
        z
          .object({
            limit: z.number().optional(),
            page: z.number().optional(),
          })
          .optional()
          .default({})
      )
      .handler(async ({ input }) => {
        return listMuxAssets(input);
      }),

    createDirectUpload: adminProcedure.handler(async () => {
      return createMuxDirectUpload();
    }),

    getUploadStatus: adminProcedure
      .input(
        z.object({
          uploadId: z.string(),
        })
      )
      .handler(async ({ input }) => {
        return getMuxUploadStatus(input.uploadId);
      }),

    getAssetStatus: adminProcedure
      .input(
        z.object({
          assetId: z.string(),
        })
      )
      .handler(async ({ input }) => {
        return getAssetStatus(input.assetId);
      }),
  },

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
          userId: z.string(),
          role: z.enum(["user", "admin"]),
        })
      )
      .handler(async ({ input }) => {
        await convexClient.mutation(api.users.updateUserRole, {
          userId: input.userId as Id<"users">,
          role: input.role,
        });
        return { success: true };
      }),
  },

  // Gesture management
  gestures: {
    listAll: adminProcedure
      .input(
        z
          .object({
            limit: z.number().optional(),
            includeInactive: z.boolean().optional(),
          })
          .optional()
          .default({})
      )
      .handler(async ({ input }) => {
        // Always use listAllForAdmin which returns ALL gestures (including hidden)
        const gestures = await convexClient.query(
          api.gestures.listAllForAdmin,
          {
            limit: input.limit,
          }
        );
        return gestures;
      }),

    update: adminProcedure
      .input(
        z.object({
          gestureId: z.string(),
          name: z.string().optional(),
          categoryIds: z.array(z.string()).optional(),
          playbackId: z.string().optional(),
          concept: z.array(z.string()).optional(),
          info: z.string().optional(),
          isActive: z.boolean().optional(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(api.gestures.updateGesture, {
          gestureId: input.gestureId as Id<"gestures">,
          name: input.name,
          categoryIds: input.categoryIds as Id<"categories">[] | undefined,
          playbackId: input.playbackId,
          concept: input.concept,
          info: input.info,
          isActive: input.isActive,
        });

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
          gestureIds: z.array(z.string()),
          updates: z.object({
            isActive: z.boolean().optional(),
            categoryIds: z.array(z.string()).optional(),
          }),
        })
      )
      .handler(async ({ input, context }) => {
        const result = await convexClient.mutation(api.gestures.bulkUpdate, {
          gestureIds: input.gestureIds as Id<"gestures">[],
          updates: {
            isActive: input.updates.isActive,
            categoryIds: input.updates.categoryIds as
              | Id<"categories">[]
              | undefined,
          },
        });

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
          gestureId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        const newStatus = await convexClient.mutation(
          api.gestures.toggleActive,
          {
            gestureId: input.gestureId as Id<"gestures">,
          }
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
          categoryIds: z.array(z.string()),
          playbackId: z.string(),
          concept: z.array(z.string()),
          info: z.string(),
          isActive: z.boolean().optional(),
        })
      )
      .handler(async ({ input, context }) => {
        const gestureId = await convexClient.mutation(api.gestures.create, {
          name: input.name,
          categoryIds: input.categoryIds as Id<"categories">[],
          playbackId: input.playbackId,
          concept: input.concept,
          info: input.info,
          isActive: input.isActive,
        });

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
        z
          .object({
            status: z.string().optional(),
            limit: z.number().optional(),
          })
          .optional()
          .default({})
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
          sponsorshipId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(api.sponsorships.approve, {
          sponsorshipId: input.sponsorshipId as Id<"sponsorships">,
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
          sponsorshipId: z.string(),
          reason: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(api.sponsorships.reject, {
          sponsorshipId: input.sponsorshipId as Id<"sponsorships">,
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
          sponsorshipId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(api.sponsorships.forceExpire, {
          sponsorshipId: input.sponsorshipId as Id<"sponsorships">,
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
          id: z.string(),
        })
      )
      .handler(async ({ input }) => {
        const sponsorship = await convexClient.query(api.sponsorships.getById, {
          id: input.id as Id<"sponsorships">,
        });
        return sponsorship;
      }),

    getActiveByGesture: adminProcedure
      .input(
        z.object({
          gestureId: z.string(),
        })
      )
      .handler(async ({ input }) => {
        const sponsorship = await convexClient.query(
          api.sponsorships.getActiveByGesture,
          {
            gestureId: input.gestureId as Id<"gestures">,
          }
        );
        return sponsorship;
      }),

    restoreOriginalVideo: adminProcedure
      .input(
        z.object({
          gestureId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        // Get active sponsorship for this gesture
        const sponsorship = await convexClient.query(
          api.sponsorships.getActiveByGesture,
          {
            gestureId: input.gestureId as Id<"gestures">,
          }
        );

        if (!sponsorship) {
          throw new Error("No active sponsorship found for this gesture");
        }

        // Restore original video by expiring the sponsorship
        await convexClient.mutation(api.sponsorships.forceExpire, {
          sponsorshipId: sponsorship._id,
          adminUserId: context.userId,
        });

        // Log action
        await convexClient.mutation(api.adminLogs.logAction, {
          userId: context.userId,
          action: "restore_original_video",
          targetId: input.gestureId,
          targetType: "gesture",
          metadata: { sponsorshipId: sponsorship._id },
        });

        return { success: true };
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
