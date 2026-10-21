import {ServiceError} from "./services/connections";

const maxJsonBodyBytes = 1024 * 1024;

export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  if (Number(request.headers.get("content-length")) > maxJsonBodyBytes) throw new ServiceError(413, "Запрос слишком большой");
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError(400, "Ожидался корректный JSON");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxJsonBodyBytes) {await reader.cancel(); throw new ServiceError(413, "Запрос слишком большой");}
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(400, "Ожидался корректный JSON");
  } finally {reader.releaseLock();}
}
