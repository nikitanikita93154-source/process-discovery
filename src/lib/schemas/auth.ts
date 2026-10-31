import { z } from "zod";

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Имя: минимум 2 символа").max(100),
    email: z.string().trim().toLowerCase().email("Некорректный email"),
    password: z.string().min(8, "Пароль: минимум 8 символов").max(100),
    inviteCode: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    orgName: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
  })
  .refine((v) => v.inviteCode !== undefined || (v.orgName !== undefined && v.orgName.length >= 2), {
    message: "Укажите название организации (минимум 2 символа)",
    path: ["orgName"],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
});

export const invitationLoginSchema = z.object({
  name: z.string().trim().min(2, "Укажите имя и фамилию").max(100),
  email: z.string().trim().toLowerCase().email("Некорректный email"),
  inviteCode: z.string().trim().min(1).max(32),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
