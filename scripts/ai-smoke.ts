import nextEnv from "@next/env";
import { requestOpenAI, safeCategory } from "../src/lib/ai";
nextEnv.loadEnvConfig(process.cwd());
try {
  const result = await requestOpenAI({ description: "Нужна система для учёта заявок клиентов нашей мастерской.", answers: [], operation: "analyze" });
  console.log(`OpenAI: реальный запрос успешен; схема проверена; вопросов: ${result.questions.length}.`);
} catch (error) {
  console.error(`OpenAI: проверка не пройдена (${safeCategory(error)}). Работа API не подтверждена.`);
  process.exitCode = 1;
}
