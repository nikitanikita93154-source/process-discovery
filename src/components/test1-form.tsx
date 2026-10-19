"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { ru } from "@/lib/content/ru";
import {
  AI_FEAR_OPTIONS,
  DEPARTMENT_DEFAULTS,
  DURATION_OPTIONS,
  ERROR_CAUSE_OPTIONS,
  EXPERIENCE_OPTIONS,
  FREQUENCY_OPTIONS,
  POSITION_OPTIONS,
  REGULATION_OPTIONS,
  SYSTEM_OPTIONS,
  TEMPLATE_FREQ_OPTIONS,
  WAITING_BEHAVIOR_OPTIONS,
  type Test1Draft,
} from "@/lib/schemas/test1";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "test1-draft";

type BlockId =
  | "passport"
  | "tasks"
  | "expectations"
  | "mistakes"
  | "gutDecisions"
  | "templateTexts"
  | "aiAttitude"
  | "openQuestion";

const BLOCKS: { id: BlockId; title: string; skippable: boolean }[] = [
  { id: "passport", title: ru.test1.block0, skippable: false },
  { id: "tasks", title: ru.test1.block1, skippable: false },
  { id: "expectations", title: ru.test1.block2, skippable: true },
  { id: "mistakes", title: ru.test1.block3, skippable: true },
  { id: "gutDecisions", title: ru.test1.block4, skippable: true },
  { id: "templateTexts", title: ru.test1.block5, skippable: true },
  { id: "aiAttitude", title: ru.test1.block6, skippable: true },
  { id: "openQuestion", title: ru.test1.block7, skippable: true },
];

const defaultValues: Test1Draft = {
  passport: { position: "", positionCustom: "", department: "", experience: undefined },
  tasks: [{ title: "", frequency: undefined, duration: undefined, systems: [], systemsCustom: "", irritation: undefined, regulated: undefined }],
  expectations: { waitingFrequency: undefined, waitingFor: "", behaviorWhileWaiting: undefined },
  mistakes: { tasksWithErrors: "", errorFrequency: undefined, causes: [] },
  gutDecisions: { hasGutDecisions: undefined, example: "" },
  templateTexts: { frequency: undefined, example: "" },
  aiAttitude: { attitudeScore: undefined, fears: [], genieTask: "" },
  openQuestion: { wasteOfTime: "" },
};

// ---------- Переиспользуемые контролы ----------

function ScaleInput({
  value,
  onChange,
  max = 5,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            "h-9 w-9 rounded-md border text-sm font-medium transition-colors cursor-pointer",
            value === n
              ? "border-indigo-600 bg-indigo-600 text-white"
              : "border-zinc-300 bg-white text-zinc-600 hover:border-indigo-400",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function ChipsSelect({
  options,
  values,
  onChange,
  withCustom,
  customValue,
  onCustomChange,
}: {
  options: readonly string[];
  values: string[] | undefined;
  onChange: (v: string[]) => void;
  withCustom?: string;
  customValue?: string;
  onCustomChange?: (v: string) => void;
}) {
  const selected = values ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() =>
              onChange(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt])
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors cursor-pointer",
              selected.includes(opt)
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-zinc-300 bg-white text-zinc-600 hover:border-indigo-400",
            )}
          >
            {opt}
          </button>
        ))}
      </div>
      {withCustom && selected.includes(withCustom) && onCustomChange !== undefined && (
        <Input placeholder={withCustom} value={customValue ?? ""} onChange={(e) => onCustomChange(e.target.value)} />
      )}
    </div>
  );
}

// ---------- Форма ----------

export function Test1Form({
  initialDraft,
  departments,
}: {
  initialDraft: Test1Draft | null;
  departments: string[];
}) {
  const router = useRouter();
  const [block, setBlock] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [blockError, setBlockError] = useState<string | null>(null);
  const skipFirstSave = useRef(true);

  const { register, control, getValues, setValue, watch, trigger, setError, clearErrors, formState: { errors } } =
    useForm<Test1Draft>({ defaultValues: defaultValues });
  const { fields, append, remove } = useFieldArray({ control, name: "tasks" });

  // Инициализация: приоритет серверному черновику, иначе localStorage
  useEffect(() => {
    let draft = initialDraft;
    if (!draft && typeof window !== "undefined") {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          draft = JSON.parse(raw) as Test1Draft;
        } catch {
          draft = null;
        }
      }
    }
    if (draft) {
      // Не затираем дефолтную пустую задачу
      resetTo(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetTo = (d: Test1Draft) => {
    const merged: Test1Draft = {
      ...defaultValues,
      ...d,
      passport: { ...defaultValues.passport, ...d.passport },
      tasks: d.tasks && d.tasks.length > 0 ? d.tasks : defaultValues.tasks,
      expectations: { ...defaultValues.expectations, ...d.expectations },
      mistakes: { ...defaultValues.mistakes, ...d.mistakes },
      gutDecisions: { ...defaultValues.gutDecisions, ...d.gutDecisions },
      templateTexts: { ...defaultValues.templateTexts, ...d.templateTexts },
      aiAttitude: { ...defaultValues.aiAttitude, ...d.aiAttitude },
      openQuestion: { ...defaultValues.openQuestion, ...d.openQuestion },
    };
    for (const key of Object.keys(merged) as (keyof Test1Draft)[]) {
      setValue(key, merged[key] as never);
    }
  };

  // Автосохранение: debounce 1.2s → localStorage + PATCH /api/test1
  useEffect(() => {
    const subscription = watch(() => {
      if (skipFirstSave.current) return;
      setSaveState("saving");
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const currentDraft = useMemo(() => getValues(), [getValues]); // не в рендер-пути

  useEffect(() => {
    if (saveState !== "saving") return;
    const t = setTimeout(async () => {
      const data = getValues();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      try {
        const res = await fetch("/api/test1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: data }),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [saveState, getValues]);

  useEffect(() => {
    skipFirstSave.current = false;
  }, []);

  // ---------- Валидация блока через zod-подсхемы ----------
  const validateBlock = useCallback(
    async (id: BlockId): Promise<boolean> => {
      clearErrors();
      setBlockError(null);
      const v = getValues(id);
      if (id === "passport") {
        const passport = v as NonNullable<Test1Draft["passport"]>;
        if (!passport.position || !passport.department || !passport.experience) {
          setBlockError("Заполните все поля паспорта");
          return false;
        }
        if (passport.position === "Свой вариант" && !passport.positionCustom?.trim()) {
          setBlockError("Укажите свою должность");
          return false;
        }
        return true;
      }
      if (id === "tasks") {
        const tasks = (v ?? []) as Test1Draft["tasks"];
        if (!tasks || tasks.length === 0) {
          setBlockError("Добавьте минимум одну задачу");
          return false;
        }
        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i];
          if (!t.title || t.title.trim().length < 3) {
            setError(`tasks.${i}.title` as never, { message: "Название: минимум 3 символа" });
            setBlockError("Проверьте задачи-кандидаты");
            return false;
          }
          if (!t.frequency || !t.duration || !t.regulated) {
            setBlockError(`Заполните все поля задачи №${i + 1}`);
            return false;
          }
          if (!t.systems || t.systems.length === 0) {
            setBlockError(`Выберите хотя бы одну систему в задаче №${i + 1}`);
            return false;
          }
          if (t.irritation === undefined || t.irritation === null) {
            setBlockError(`Укажите уровень раздражения в задаче №${i + 1}`);
            return false;
          }
        }
        return true;
      }
      // Опциональные блоки: заполнены частично → просим дозаполнить или пропустить
      switch (id) {
        case "expectations": {
          const e = v as NonNullable<Test1Draft["expectations"]>;
          const partially = e.waitingFrequency !== undefined || e.behaviorWhileWaiting !== undefined;
          const fully = e.waitingFrequency !== undefined && e.behaviorWhileWaiting !== undefined;
          if (partially && !fully) {
            setBlockError("Заполните блок полностью или нажмите «Пропустить блок»");
            return false;
          }
          return fully;
        }
        case "mistakes": {
          const m = v as NonNullable<Test1Draft["mistakes"]>;
          const partially = m.tasksWithErrors || m.errorFrequency !== undefined || (m.causes && m.causes.length > 0);
          const fully = m.errorFrequency !== undefined && Boolean(m.causes && m.causes.length > 0);
          if (partially && !fully) {
            setBlockError("Заполните блок полностью или нажмите «Пропустить блок»");
            return false;
          }
          return fully;
        }
        case "gutDecisions": {
          const g = v as NonNullable<Test1Draft["gutDecisions"]>;
          if (g.hasGutDecisions === undefined) return false;
          if (g.hasGutDecisions === true && !g.example?.trim()) {
            setBlockError("Приведите пример решения «на глазок» или нажмите «Пропустить блок»");
            return false;
          }
          return true;
        }
        case "templateTexts": {
          const t = v as NonNullable<Test1Draft["templateTexts"]>;
          const partially = t.frequency !== undefined || t.example;
          const fully = t.frequency !== undefined && (t.frequency === "нет" || Boolean(t.example?.trim()));
          if (partially && !fully) {
            setBlockError("Укажите частоту и пример (или «Пропустить блок»)");
            return false;
          }
          return fully;
        }
        case "aiAttitude": {
          const a = v as NonNullable<Test1Draft["aiAttitude"]>;
          return a.attitudeScore !== undefined;
        }
        default:
          return true;
      }
    },
    [clearErrors, getValues, setError],
  );

  const cleanBlock = (id: BlockId) => {
    switch (id) {
      case "expectations":
        setValue("expectations", defaultValues.expectations);
        break;
      case "mistakes":
        setValue("mistakes", defaultValues.mistakes);
        break;
      case "gutDecisions":
        setValue("gutDecisions", defaultValues.gutDecisions);
        break;
      case "templateTexts":
        setValue("templateTexts", defaultValues.templateTexts);
        break;
      case "aiAttitude":
        setValue("aiAttitude", defaultValues.aiAttitude);
        break;
      case "openQuestion":
        setValue("openQuestion", defaultValues.openQuestion);
        break;
      default:
        break;
    }
  };

  const goNext = async () => {
    const ok = await validateBlock(BLOCKS[block].id);
    if (!ok && !BLOCKS[block].skippable) return;
    if (!ok && BLOCKS[block].skippable) {
      // частично заполненный обязательный к заполнению блок не пускаем дальше
      return;
    }
    if (block < BLOCKS.length - 1) setBlock(block + 1);
    else await submitComplete();
  };

  const goSkip = () => {
    cleanBlock(BLOCKS[block].id);
    if (block < BLOCKS.length - 1) setBlock(block + 1);
  };

  const submitComplete = async () => {
    // Финальная валидация всего теста на сервере
    const data = getValues();
    // Очистка незаполненных опциональных блоков
    const payload = { ...data };
    setSaveState("saving");
    const res = await fetch("/api/test1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload, complete: true }),
    });
    if (res.ok) {
      window.localStorage.removeItem(STORAGE_KEY);
      router.push("/me");
      router.refresh();
    } else {
      const err = (await res.json().catch(() => null)) as { issues?: { path: (string | number | symbol)[] }[] } | null;
      const firstPath = err?.issues?.[0]?.path?.[0];
      const targetBlock = BLOCKS.findIndex((b) => b.id === firstPath);
      setBlockError("Тест заполнен не полностью — вернитесь к незаполненным блокам");
      if (targetBlock >= 0) setBlock(targetBlock);
      setSaveState("error");
    }
  };

  const passport = watch("passport");
  const current = BLOCKS[block];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{ru.test1.title}</h1>
        <p className="text-sm text-zinc-500">{ru.test1.subtitle}</p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {current.title} · блок {block + 1} из {BLOCKS.length}
          </span>
          <span>
            {saveState === "saving" && "⟳ сохранение…"}
            {saveState === "saved" && `✓ ${ru.test1.saved}`}
            {saveState === "error" && "⚠ ошибка сохранения"}
          </span>
        </div>
        <Progress value={((block + 1) / BLOCKS.length) * 100} />
      </div>

      <Card>
        <CardContent className="p-6">
          {block === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{ru.test1.passport.position}</Label>
                <Select {...register("passport.position")}>
                  <option value="">— выберите —</option>
                  {POSITION_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
                {passport?.position === "Свой вариант" && (
                  <Input className="mt-2" placeholder={ru.test1.passport.positionCustom} {...register("passport.positionCustom")} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{ru.test1.passport.department}</Label>
                <Select {...register("passport.department")}>
                  <option value="">— выберите —</option>
 {(departments.length > 0 ? departments : [...DEPARTMENT_DEFAULTS]).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{ru.test1.passport.experience}</Label>
                <Select {...register("passport.experience")}>
                  <option value="">— выберите —</option>
                  {EXPERIENCE_OPTIONS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {block === 1 && (
            <div className="space-y-6">
              {fields.map((field, i) => {
                const task = watch(`tasks.${i}`);
                return (
                  <div key={field.id} className="space-y-4 rounded-lg border border-zinc-200 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Задача {i + 1}</h3>
                      {fields.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={() => remove(i)}>
                          {ru.test1.removeTask}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>{ru.test1.task.title}</Label>
                      <Input {...register(`tasks.${i}.title`)} />
                      <FieldError>{(errors.tasks as Record<number, { title?: { message: string } }> | undefined)?.[i]?.title?.message}</FieldError>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{ru.test1.task.frequency}</Label>
                        <Select {...register(`tasks.${i}.frequency`)}>
                          <option value="">—</option>
                          {FREQUENCY_OPTIONS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>{ru.test1.task.duration}</Label>
                        <Select {...register(`tasks.${i}.duration`)}>
                          <option value="">—</option>
                        {DURATION_OPTIONS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{ru.test1.task.systems}</Label>
                      <ChipsSelect
                        options={SYSTEM_OPTIONS}
                        values={task?.systems}
                        onChange={(v) => setValue(`tasks.${i}.systems`, v as (typeof SYSTEM_OPTIONS)[number][])}
                        withCustom="другое"
                        customValue={task?.systemsCustom}
                        onCustomChange={(v) => setValue(`tasks.${i}.systemsCustom`, v)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{ru.test1.task.irritation}</Label>
                      <ScaleInput
                        value={task?.irritation}
                        onChange={(v) => setValue(`tasks.${i}.irritation`, v)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{ru.test1.task.regulated}</Label>
                      <Select {...register(`tasks.${i}.regulated`)}>
                        <option value="">—</option>
                        {REGULATION_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                );
              })}
              {fields.length < 3 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    append({ title: "", frequency: undefined, duration: undefined, systems: [], systemsCustom: "", irritation: undefined, regulated: undefined })
                  }
                >
                  + {ru.test1.addTask}
                </Button>
              )}
            </div>
          )}

          {block === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{ru.test1.expectations.waitingFrequency}</Label>
                <ScaleInput
                  value={watch("expectations.waitingFrequency")}
                  onChange={(v) => setValue("expectations.waitingFrequency", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{ru.test1.expectations.waitingFor} <span className="text-zinc-400">({ru.common.optional})</span></Label>
                <Input {...register("expectations.waitingFor")} />
              </div>
              <div className="space-y-1.5">
                <Label>{ru.test1.expectations.behaviorWhileWaiting}</Label>
                <Select {...register("expectations.behaviorWhileWaiting")}>
                  <option value="">—</option>
                  {WAITING_BEHAVIOR_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {block === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>
                  {ru.test1.mistakes.tasksWithErrors} <span className="text-zinc-400">({ru.common.optional})</span>
                </Label>
                <Textarea {...register("mistakes.tasksWithErrors")} />
              </div>
              <div className="space-y-1.5">
                <Label>{ru.test1.mistakes.errorFrequency}</Label>
                <Select {...register("mistakes.errorFrequency")}>
                  <option value="">—</option>
                  {FREQUENCY_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{ru.test1.mistakes.causes}</Label>
                <ChipsSelect
                  options={ERROR_CAUSE_OPTIONS}
                  values={watch("mistakes.causes")}
                  onChange={(v) => setValue("mistakes.causes", v as (typeof ERROR_CAUSE_OPTIONS)[number][])}
                />
              </div>
            </div>
          )}

          {block === 4 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{ru.test1.gutDecisions.hasGutDecisions}</Label>
                <div className="flex gap-2">
                  {[true, false].map((v) => (
                    <Button
                      key={String(v)}
                      type="button"
                      variant={watch("gutDecisions.hasGutDecisions") === v ? "default" : "outline"}
                      onClick={() => setValue("gutDecisions.hasGutDecisions", v)}
                    >
                      {v ? ru.common.yes : ru.common.no}
                    </Button>
                  ))}
                </div>
              </div>
              {watch("gutDecisions.hasGutDecisions") === true && (
                <div className="space-y-1.5">
                  <Label>{ru.test1.gutDecisions.example}</Label>
                  <Textarea {...register("gutDecisions.example")} />
                </div>
              )}
            </div>
          )}

          {block === 5 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{ru.test1.templateTexts.frequency}</Label>
                <Select {...register("templateTexts.frequency")}>
                  <option value="">—</option>
                  {TEMPLATE_FREQ_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </div>
              {watch("templateTexts.frequency") !== "нет" && watch("templateTexts.frequency") !== undefined && (
                <div className="space-y-1.5">
                  <Label>{ru.test1.templateTexts.example}</Label>
                  <Textarea {...register("templateTexts.example")} />
                </div>
              )}
            </div>
          )}

          {block === 6 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{ru.test1.aiAttitude.attitudeScore}</Label>
                <ScaleInput
                  value={watch("aiAttitude.attitudeScore")}
                  onChange={(v) => setValue("aiAttitude.attitudeScore", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{ru.test1.aiAttitude.fears}</Label>
                <ChipsSelect
                  options={AI_FEAR_OPTIONS}
                  values={watch("aiAttitude.fears")}
                  onChange={(v) => setValue("aiAttitude.fears", v as (typeof AI_FEAR_OPTIONS)[number][])}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {ru.test1.aiAttitude.genieTask} <span className="text-zinc-400">({ru.common.optional})</span>
                </Label>
                <Textarea {...register("aiAttitude.genieTask")} />
              </div>
            </div>
          )}

          {block === 7 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>
                  {ru.test1.openQuestion.wasteOfTime} <span className="text-zinc-400">({ru.common.optional})</span>
                </Label>
                <Textarea {...register("openQuestion.wasteOfTime")} />
              </div>
              <Button type="button" size="lg" className="w-full" onClick={submitComplete}>
                {ru.test1.submit}
              </Button>
            </div>
          )}

          {blockError && <p className="pt-2 text-sm text-red-600">{blockError}</p>}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" disabled={block === 0} onClick={() => setBlock(block - 1)}>
          ← {ru.test1.back}
        </Button>
        <div className="flex gap-2">
          {current.skippable && (
            <Button type="button" variant="ghost" onClick={goSkip}>
              {ru.test1.skip}
            </Button>
          )}
          <Button type="button" onClick={goNext} disabled={block === BLOCKS.length - 1}>
            {ru.test1.next} →
          </Button>
        </div>
      </div>
    </div>
  );
}
