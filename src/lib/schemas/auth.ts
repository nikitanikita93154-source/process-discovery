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
    message: "Укажите invite-код или название организации",
    path: ["orgName"],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
