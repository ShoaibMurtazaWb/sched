import { Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { NotificationsProcessor } from "./notifications.processor";

@ApiTags("notifications")
@Controller("api/v1/notifications")
export class NotificationsController {
  constructor(private readonly processor: NotificationsProcessor) {}

  @Post("sweep")
  @HttpCode(200)
  @ApiOperation({ summary: "Process pending notification outbox jobs" })
  async sweep() {
    return this.processor.processPendingJobs(20);
  }
}
