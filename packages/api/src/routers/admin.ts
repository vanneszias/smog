import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { z } from "zod";
import { adminProcedure } from "../index";
import { categoriesCache, logCacheOperation } from "../lib/categoriesCache";
import { convexClient, withServiceAuth } from "../lib/convex";
import { buildCsvString } from "../lib/csv";
import { triggerEmail } from "../lib/emailTrigger";
import {
  createMuxDirectUpload,
  getAssetStatus,
  getMuxUploadStatus,
  listMuxAssets,
} from "../lib/mux";

interface AdminLogInput extends Record<string, unknown> {
  action: string;
  metadata?: unknown;
  targetId: string;
  targetType: string;
  userId: Id<"users">;
}

function logAdminAction(input: AdminLogInput) {
  return convexClient.mutation(api.adminLogs.logAction, withServiceAuth(input));
}

export const adminRouter = {
  // Category management
  categories: {
    create: adminProcedure
      .input(
        z.object({
          isActive: z.boolean().optional(),
          name: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        const categoryId = await convexClient.mutation(
          api.categories.create,
          withServiceAuth({
            isActive: input.isActive,
            name: input.name,
          })
        );

        // Log action
        await logAdminAction({
          action: "create_category",
          metadata: input,
          targetId: categoryId,
          targetType: "category",
          userId: context.userId,
        });

        // Invalidate category cache since data has changed
        categoriesCache.invalidate();
        logCacheOperation(
          "create_category",
          `invalidated after creating ${categoryId}`
        );

        return { categoryId };
      }),

    delete: adminProcedure
      .input(
        z.object({
          categoryId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(
          api.categories.deleteCategory,
          withServiceAuth({
            categoryId: input.categoryId as Id<"categories">,
          })
        );

        // Log action
        await logAdminAction({
          action: "delete_category",
          targetId: input.categoryId,
          targetType: "category",
          userId: context.userId,
        });

        // Invalidate category cache since data has changed
        categoriesCache.invalidate();
        logCacheOperation(
          "delete_category",
          `invalidated after deleting ${input.categoryId}`
        );

        return { success: true };
      }),
    listAll: adminProcedure.handler(async () => {
      const categories = await convexClient.query(
        api.categories.listAllForAdmin,
        withServiceAuth({})
      );
      return categories;
    }),

    update: adminProcedure
      .input(
        z.object({
          categoryId: z.string(),
          isActive: z.boolean().optional(),
          name: z.string().optional(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(
          api.categories.update,
          withServiceAuth({
            categoryId: input.categoryId as Id<"categories">,
            isActive: input.isActive,
            name: input.name,
          })
        );

        // Log action
        await logAdminAction({
          action: "update_category",
          metadata: input,
          targetId: input.categoryId,
          targetType: "category",
          userId: context.userId,
        });

        // Invalidate category cache since data has changed
        categoriesCache.invalidate();
        logCacheOperation(
          "update_category",
          `invalidated after updating ${input.categoryId}`
        );

        return { success: true };
      }),
  },

  // Gesture management
  gestures: {
    bulkUpdate: adminProcedure
      .input(
        z.object({
          gestureIds: z.array(z.string()),
          updates: z.object({
            categoryIds: z.array(z.string()).optional(),
            isActive: z.boolean().optional(),
          }),
        })
      )
      .handler(async ({ input, context }) => {
        const result = await convexClient.mutation(
          api.gestures.bulkUpdate,
          withServiceAuth({
            gestureIds: input.gestureIds as Id<"gestures">[],
            updates: {
              categoryIds: input.updates.categoryIds as
                | Id<"categories">[]
                | undefined,
              isActive: input.updates.isActive,
            },
          })
        );

        // Log action
        await logAdminAction({
          action: "bulk_update_gestures",
          metadata: { count: result.updated, updates: input.updates },
          targetId: input.gestureIds.join(","),
          targetType: "gesture",
          userId: context.userId,
        });

        return result;
      }),

    create: adminProcedure
      .input(
        z.object({
          categoryIds: z.array(z.string()),
          concept: z.array(z.string()),
          info: z.string(),
          isActive: z.boolean().optional(),
          name: z.string(),
          playbackId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        const gestureId = await convexClient.mutation(
          api.gestures.create,
          withServiceAuth({
            categoryIds: input.categoryIds as Id<"categories">[],
            concept: input.concept,
            info: input.info,
            isActive: input.isActive,
            name: input.name,
            playbackId: input.playbackId,
          })
        );

        // Log action
        await logAdminAction({
          action: "create_gesture",
          metadata: input,
          targetId: gestureId,
          targetType: "gesture",
          userId: context.userId,
        });

        return { gestureId };
      }),
    listAll: adminProcedure
      .input(
        z
          .object({
            includeInactive: z.boolean().optional(),
            limit: z.number().optional(),
          })
          .optional()
          .default({})
      )
      .handler(async ({ input }) => {
        // Always use listAllForAdmin which returns ALL gestures (including hidden)
        const gestures = await convexClient.query(
          api.gestures.listAllForAdmin,
          withServiceAuth({
            limit: input.limit,
          })
        );
        return gestures;
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
          withServiceAuth({
            gestureId: input.gestureId as Id<"gestures">,
          })
        );

        // Log action
        await logAdminAction({
          action: "toggle_gesture_active",
          metadata: { isActive: newStatus },
          targetId: input.gestureId,
          targetType: "gesture",
          userId: context.userId,
        });

        return { isActive: newStatus, success: true };
      }),

    update: adminProcedure
      .input(
        z.object({
          categoryIds: z.array(z.string()).optional(),
          concept: z.array(z.string()).optional(),
          gestureId: z.string(),
          info: z.string().optional(),
          isActive: z.boolean().optional(),
          name: z.string().optional(),
          playbackId: z.string().optional(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(
          api.gestures.updateGesture,
          withServiceAuth({
            categoryIds: input.categoryIds as Id<"categories">[] | undefined,
            concept: input.concept,
            gestureId: input.gestureId as Id<"gestures">,
            info: input.info,
            isActive: input.isActive,
            name: input.name,
            playbackId: input.playbackId,
          })
        );

        // Log action
        await logAdminAction({
          action: "update_gesture",
          metadata: input,
          targetId: input.gestureId,
          targetType: "gesture",
          userId: context.userId,
        });

        return { success: true };
      }),
  },

  // Admin logs
  logs: {
    getByAction: adminProcedure
      .input(
        z.object({
          action: z.string(),
          limit: z.number().optional(),
        })
      )
      .handler(async ({ input }) => {
        const logs = await convexClient.query(
          api.adminLogs.getByAction,
          withServiceAuth(input)
        );
        return logs;
      }),

    getByTarget: adminProcedure
      .input(
        z.object({
          targetId: z.string(),
          targetType: z.string(),
        })
      )
      .handler(async ({ input }) => {
        const logs = await convexClient.query(
          api.adminLogs.getByTarget,
          withServiceAuth(input)
        );
        return logs;
      }),
    getRecent: adminProcedure
      .input(
        z.object({
          limit: z.number().optional(),
        })
      )
      .handler(async ({ input }) => {
        const logs = await convexClient.query(
          api.adminLogs.getRecent,
          withServiceAuth(input)
        );
        return logs;
      }),
  },
  // Mux video management
  mux: {
    createDirectUpload: adminProcedure.handler(async () =>
      createMuxDirectUpload()
    ),

    getAssetStatus: adminProcedure
      .input(
        z.object({
          assetId: z.string(),
        })
      )
      .handler(async ({ input }) => getAssetStatus(input.assetId)),

    getUploadStatus: adminProcedure
      .input(
        z.object({
          uploadId: z.string(),
        })
      )
      .handler(async ({ input }) => getMuxUploadStatus(input.uploadId)),
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
      .handler(async ({ input }) => listMuxAssets(input)),
  },

  // Sponsorship management
  sponsorships: {
    approve: adminProcedure
      .input(
        z.object({
          sponsorshipId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        // Fetch sponsorship before approval to get email + gesture info for the notification
        const sponsorship = await convexClient.query(
          api.sponsorships.getById,
          withServiceAuth({
            id: input.sponsorshipId as Id<"sponsorships">,
          })
        );

        await convexClient.mutation(
          api.sponsorships.approve,
          withServiceAuth({
            adminUserId: context.userId,
            sponsorshipId: input.sponsorshipId as Id<"sponsorships">,
          })
        );

        // Log action
        await logAdminAction({
          action: "approve_sponsorship",
          targetId: input.sponsorshipId,
          targetType: "sponsorship",
          userId: context.userId,
        });

        // Trigger "sponsorship live" email (fire-and-forget)
        if (sponsorship) {
          const gestureName = await convexClient
            .query(api.gestures.getById, { id: sponsorship.gestureId })
            .then((g) => g?.name ?? "your gesture")
            .catch(() => "your gesture");

          triggerEmail({
            endDate: sponsorship.endDate,
            gestureName,
            sponsorName: sponsorship.contactFullName || sponsorship.sponsorName,
            startDate: Date.now(),
            to: sponsorship.sponsorEmail,
            type: "sponsorship_live",
          }).catch((err: unknown) => {
            console.error(
              "[Admin] Failed to trigger sponsorship_live email:",
              err
            );
          });
        }

        return { success: true };
      }),

    cancelPendingPayment: adminProcedure
      .input(
        z.object({
          sponsorshipId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(
          api.sponsorships.cancelPendingPayment,
          withServiceAuth({
            sponsorshipId: input.sponsorshipId as Id<"sponsorships">,
          })
        );

        await logAdminAction({
          action: "cancel_pending_payment",
          targetId: input.sponsorshipId,
          targetType: "sponsorship",
          userId: context.userId,
        });

        return { success: true };
      }),

    exportToCsv: adminProcedure
      .input(
        z.object({
          from: z.number().optional(),
          status: z
            .enum([
              "all",
              "active",
              "expired",
              "pending",
              "pending_payment",
              "pending_approval",
              "pending_resubmission",
              "rejected",
              "cancelled",
            ])
            .default("all"),
          to: z.number().optional(),
        })
      )
      .handler(async ({ input }) => {
        const sponsorships = await convexClient.query(
          api.sponsorships.listAll,
          withServiceAuth({
            limit: 10_000,
            status: input.status === "all" ? undefined : input.status,
          })
        );

        // Apply date filters if provided
        const filtered = sponsorships.filter((s) => {
          if (input.from && s.createdAt < input.from) {
            return false;
          }
          if (input.to && s.createdAt > input.to) {
            return false;
          }
          return true;
        });

        // Map to CSV format with all requested columns
        // biome-ignore assist/source/useSortedKeys: key order defines CSV column order
        const rows = filtered.map((s) => ({
          ID: s._id,
          Status: s.status,
          "Sponsor name": s.sponsorName,
          "Sponsor email": s.sponsorEmail,
          "Contact name": s.contactFullName,
          Company: s.contactCompany || "",
          "Invoice name": s.invoiceName || "",
          "VAT number": s.invoiceVatNumber || "",
          "Invoice email": s.invoiceEmail || "",
          "Invoice requested": s.invoiceRequested ? "Yes" : "No",
          "Has logo": s.hasLogo ? "Yes" : "No",
          "Payment amount (€)": (s.paymentAmount / 100).toFixed(2),
          "Mollie payment ID": s.molliePaymentId || "",
          "Start date": new Date(s.startDate).toISOString(),
          "End date": new Date(s.endDate).toISOString(),
          "Duration (years)": s.durationYears,
          "Gesture ID": s.gestureId,
          "Created at": new Date(s.createdAt).toISOString(),
        }));

        return { csv: buildCsvString(rows) };
      }),

    forceExpire: adminProcedure
      .input(
        z.object({
          sponsorshipId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(
          api.sponsorships.forceExpire,
          withServiceAuth({
            adminUserId: context.userId,
            sponsorshipId: input.sponsorshipId as Id<"sponsorships">,
          })
        );

        // Log action
        await logAdminAction({
          action: "force_expire_sponsorship",
          targetId: input.sponsorshipId,
          targetType: "sponsorship",
          userId: context.userId,
        });

        return { success: true };
      }),

    generateReEditLink: adminProcedure
      .input(
        z.object({
          sponsorshipId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        const token = crypto.randomUUID();
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

        await convexClient.mutation(
          api.sponsorships.setReEditToken,
          withServiceAuth({
            expiresAt,
            sponsorshipId: input.sponsorshipId as Id<"sponsorships">,
            token,
          })
        );

        // Log action
        await logAdminAction({
          action: "generate_re_edit_link",
          metadata: { expiresAt },
          targetId: input.sponsorshipId,
          targetType: "sponsorship",
          userId: context.userId,
        });

        const baseUrl = process.env.CORS_ORIGIN || "http://localhost:3001";
        return {
          expiresAt,
          url: `${baseUrl}/sponsors/re-edit?token=${token}`,
        };
      }),

    getActiveByGesture: adminProcedure
      .input(
        z.object({
          gestureId: z.string(),
        })
      )
      .handler(async ({ input }) => {
        const sponsorship = await convexClient.query(
          api.sponsorships.getActiveByGestureForService,
          withServiceAuth({
            gestureId: input.gestureId as Id<"gestures">,
          })
        );
        return sponsorship;
      }),

    getById: adminProcedure
      .input(
        z.object({
          id: z.string(),
        })
      )
      .handler(async ({ input }) => {
        const sponsorship = await convexClient.query(
          api.sponsorships.getById,
          withServiceAuth({ id: input.id as Id<"sponsorships"> })
        );
        return sponsorship;
      }),

    getReEditLink: adminProcedure
      .input(z.object({ sponsorshipId: z.string() }))
      .handler(async ({ input }) => {
        const result = await convexClient.query(
          api.sponsorships.getReEditLinkForAdmin,
          withServiceAuth({
            sponsorshipId: input.sponsorshipId as Id<"sponsorships">,
          })
        );
        if (!result) {
          return null;
        }
        const baseUrl = process.env.CORS_ORIGIN || "http://localhost:3001";
        return {
          expired: result.expired,
          expiresAt: result.expiresAt,
          url: `${baseUrl}/sponsors/re-edit?token=${result.token}`,
        };
      }),
    listAll: adminProcedure
      .input(
        z
          .object({
            limit: z.number().optional(),
            status: z.string().optional(),
          })
          .optional()
          .default({})
      )
      .handler(async ({ input }) => {
        const sponsorships = await convexClient.query(
          api.sponsorships.listAll,
          withServiceAuth(input)
        );
        return sponsorships;
      }),

    listPendingApproval: adminProcedure.handler(async () => {
      const sponsorships = await convexClient.query(
        api.sponsorships.listPendingApproval,
        withServiceAuth({})
      );
      return sponsorships;
    }),

    markPaidManually: adminProcedure
      .input(
        z.object({
          sponsorshipId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(
          api.sponsorships.markAsAwaitingApproval,
          withServiceAuth({
            sponsorshipId: input.sponsorshipId as Id<"sponsorships">,
          })
        );

        // Log action
        await logAdminAction({
          action: "mark_paid_manually",
          targetId: input.sponsorshipId,
          targetType: "sponsorship",
          userId: context.userId,
        });

        return { success: true };
      }),

    reject: adminProcedure
      .input(
        z.object({
          reason: z.string(),
          sponsorshipId: z.string(),
        })
      )
      .handler(async ({ input, context }) => {
        await convexClient.mutation(
          api.sponsorships.reject,
          withServiceAuth({
            adminUserId: context.userId,
            reason: input.reason,
            sponsorshipId: input.sponsorshipId as Id<"sponsorships">,
          })
        );

        // Log action
        await logAdminAction({
          action: "reject_sponsorship",
          metadata: { reason: input.reason },
          targetId: input.sponsorshipId,
          targetType: "sponsorship",
          userId: context.userId,
        });

        return { success: true };
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
          api.sponsorships.getActiveByGestureForService,
          withServiceAuth({
            gestureId: input.gestureId as Id<"gestures">,
          })
        );

        if (!sponsorship) {
          throw new Error("No active sponsorship found for this gesture");
        }

        // Restore original video by expiring the sponsorship
        await convexClient.mutation(
          api.sponsorships.forceExpire,
          withServiceAuth({
            adminUserId: context.userId,
            sponsorshipId: sponsorship._id,
          })
        );

        // Log action
        await logAdminAction({
          action: "restore_original_video",
          metadata: { sponsorshipId: sponsorship._id },
          targetId: input.gestureId,
          targetType: "gesture",
          userId: context.userId,
        });

        return { success: true };
      }),
  },

  // User management
  users: {
    list: adminProcedure
      .input(
        z.object({
          cursor: z.string().optional(),
          limit: z.number().optional(),
        })
      )
      .handler(async ({ input }) => {
        const result = await convexClient.query(
          api.users.listAllUsers,
          withServiceAuth(input)
        );
        return result;
      }),

    listAdmins: adminProcedure.handler(async () => {
      const admins = await convexClient.query(
        api.users.listAdmins,
        withServiceAuth({})
      );
      return admins;
    }),

    updateRole: adminProcedure
      .input(
        z.object({
          role: z.enum(["user", "admin"]),
          userId: z.string(),
        })
      )
      .handler(async ({ input }) => {
        await convexClient.mutation(
          api.users.updateUserRole,
          withServiceAuth({
            role: input.role,
            userId: input.userId as Id<"users">,
          })
        );
        return { success: true };
      }),
  },

  // Verify user is admin
  verifyAdmin: adminProcedure.handler(async ({ context }) => {
    const user = await convexClient.query(
      api.users.getUserByWorkOSId,
      withServiceAuth({ workosId: context.workosId })
    );
    return user;
  }),
};
