-- AddForeignKey
ALTER TABLE "ResumeDraft" ADD CONSTRAINT "ResumeDraft_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "ResumeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "ResumeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
