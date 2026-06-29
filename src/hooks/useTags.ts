import { useCallback, useEffect, useState } from "react";
import { Tag } from "../types";
import { listTags } from "../db/repositories";

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);

  const refetch = useCallback(async () => {
    setTags(await listTags());
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { tags, refetch };
}
