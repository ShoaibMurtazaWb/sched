import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createEventTypeBodySchema,
  eventTypeIdParamSchema,
  listEventTypesQuerySchema,
  updateEventTypeBodySchema,
  type CreateEventTypeBody,
  type ListEventTypesQuery,
  type UpdateEventTypeBody,
} from "@sched/api-contract";
import { CurrentUserId } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { zodPipe } from "../shared/pipes/zod-validation.pipe";
import { EventTypesService } from "./event-types.service";

@ApiTags("event-types")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/event-types")
export class EventTypesController {
  constructor(private readonly eventTypes: EventTypesService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's event types" })
  list(
    @CurrentUserId() userId: string,
    @Query(zodPipe(listEventTypesQuerySchema)) query: ListEventTypesQuery,
  ) {
    return this.eventTypes.list(userId, query);
  }

  @Post()
  @ApiOperation({ summary: "Create an event type" })
  create(
    @CurrentUserId() userId: string,
    @Body(zodPipe(createEventTypeBodySchema)) body: CreateEventTypeBody,
  ) {
    return this.eventTypes.create(userId, body);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one owned event type" })
  get(
    @CurrentUserId() userId: string,
    @Param(zodPipe(eventTypeIdParamSchema)) params: { id: string },
  ) {
    return this.eventTypes.getOwned(userId, params.id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update an active owned event type" })
  update(
    @CurrentUserId() userId: string,
    @Param(zodPipe(eventTypeIdParamSchema)) params: { id: string },
    @Body(zodPipe(updateEventTypeBodySchema)) body: UpdateEventTypeBody,
  ) {
    return this.eventTypes.update(userId, params.id, body);
  }

  @Post(":id/duplicate")
  @ApiOperation({ summary: "Duplicate an existing event type" })
  duplicate(
    @CurrentUserId() userId: string,
    @Param(zodPipe(eventTypeIdParamSchema)) params: { id: string },
  ) {
    return this.eventTypes.duplicate(userId, params.id);
  }

  @Post(":id/archive")
  @ApiOperation({ summary: "Archive an owned event type (idempotent)" })
  archive(
    @CurrentUserId() userId: string,
    @Param(zodPipe(eventTypeIdParamSchema)) params: { id: string },
  ) {
    return this.eventTypes.archive(userId, params.id);
  }

  @Post(":id/unarchive")
  @ApiOperation({ summary: "Unarchive / restore an owned event type (idempotent)" })
  unarchive(
    @CurrentUserId() userId: string,
    @Param(zodPipe(eventTypeIdParamSchema)) params: { id: string },
  ) {
    return this.eventTypes.unarchive(userId, params.id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Permanently delete an event type if it has no bookings" })
  async delete(
    @CurrentUserId() userId: string,
    @Param(zodPipe(eventTypeIdParamSchema)) params: { id: string },
  ) {
    await this.eventTypes.delete(userId, params.id);
    return { success: true };
  }
}
