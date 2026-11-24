import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AddToCartDto } from './dto/add-to-cart.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { ProductStatus, StoreStatus, CartStatus, Prisma } from '@prisma/client';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves or initializes CustomerProfile for the authenticated user.
   */
  async getOrCreateCustomerProfileId(userId: string): Promise<string> {
    let profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found.');

      profile = await this.prisma.customerProfile.create({
        data: {
          userId,
          firstName: 'Customer',
          lastName: user.phone || 'User',
        },
      });
    }

    return profile.id;
  }

  /**
   * Resolves or creates an active Cart for the customer.
   */
  async getOrCreateActiveCart(customerId: string) {
    let cart = await this.prisma.cart.findFirst({
      where: { customerId, status: CartStatus.ACTIVE },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    store: true,
                    images: { where: { isPrimary: true }, take: 1 },
                  },
                },
                inventoryItems: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          customerId,
          status: CartStatus.ACTIVE,
          currency: 'USD',
        },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: {
                    include: {
                      store: true,
                      images: { where: { isPrimary: true }, take: 1 },
                    },
                  },
                  inventoryItems: true,
                },
              },
            },
          },
        },
      });
    }

    return cart;
  }

  /**
   * Adds a product variant to the customer's active cart.
   */
  async addItem(userId: string, dto: AddToCartDto) {
    const customerId = await this.getOrCreateCustomerProfileId(userId);

    // 1. Validate ProductVariant & associated Product & Store
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: {
        product: {
          include: { store: true },
        },
        inventoryItems: true,
      },
    });

    if (!variant) {
      throw new NotFoundException(`Product variant with ID "${dto.variantId}" not found.`);
    }

    if (variant.product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestException('This product is not currently available for purchase.');
    }

    if (variant.product.store.status !== StoreStatus.ACTIVE) {
      throw new BadRequestException('The store selling this product is currently inactive.');
    }

    // 2. Validate Inventory Available Quantity
    const invItem = variant.inventoryItems.find((inv) => inv.storeId === variant.product.storeId);
    const availableQuantity = invItem ? Math.max(0, invItem.quantityOnHand - invItem.reservedQuantity) : 0;

    if (availableQuantity < dto.quantity) {
      throw new BadRequestException(
        `Insufficient stock for "${variant.title}". Available: ${availableQuantity}, Requested: ${dto.quantity}.`,
      );
    }

    // 3. Resolve active cart
    const cart = await this.getOrCreateActiveCart(customerId);

    // 4. Check for existing item in cart
    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_variantId: {
          cartId: cart.id,
          variantId: variant.id,
        },
      },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + dto.quantity;
      if (newQuantity > availableQuantity) {
        throw new BadRequestException(
          `Cannot add ${dto.quantity} more. Current cart quantity (${existingItem.quantity}) plus addition exceeds available stock (${availableQuantity}).`,
        );
      }

      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
          unitPrice: variant.price, // update to authoritative current price
        },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: variant.id,
          quantity: dto.quantity,
          unitPrice: variant.price,
        },
      });
    }

    return this.getCart(userId);
  }

  /**
   * Retrieves the customer's current shopping cart with live pricing and store groupings.
   */
  async getCart(userId: string) {
    const customerId = await this.getOrCreateCustomerProfileId(userId);
    const cart = await this.getOrCreateActiveCart(customerId);

    // Group items by store
    const storeMap = new Map<string, {
      store: { id: string; name: string; slug: string; status: StoreStatus };
      items: any[];
      subtotal: Prisma.Decimal;
    }>();

    let grandSubtotal = new Prisma.Decimal(0);
    let totalItemsCount = 0;

    for (const item of cart.items) {
      const { variant } = item;
      const { product } = variant;
      const { store } = product;

      // Authoritative current price
      const currentPrice = new Prisma.Decimal(variant.price);
      const lineTotal = currentPrice.mul(item.quantity);
      grandSubtotal = grandSubtotal.add(lineTotal);
      totalItemsCount += item.quantity;

      // Check stock availability
      const invItem = variant.inventoryItems.find((inv) => inv.storeId === store.id);
      const availableStock = invItem ? Math.max(0, invItem.quantityOnHand - invItem.reservedQuantity) : 0;
      const isAvailable = availableStock >= item.quantity && product.status === ProductStatus.PUBLISHED && store.status === StoreStatus.ACTIVE;

      const itemDetail = {
        id: item.id,
        variantId: variant.id,
        productId: product.id,
        productTitle: product.title,
        productSlug: product.slug,
        variantTitle: variant.title,
        sku: variant.sku,
        attributes: variant.attributes,
        quantity: item.quantity,
        unitPrice: currentPrice,
        priceSnapshotAtAdd: item.unitPrice,
        priceChanged: !currentPrice.equals(item.unitPrice),
        lineTotal,
        availableStock,
        isAvailable,
        stockWarning: !isAvailable ? 'Item is unavailable or exceeds available stock' : null,
      };

      if (!storeMap.has(store.id)) {
        storeMap.set(store.id, {
          store: {
            id: store.id,
            name: store.name,
            slug: store.slug,
            status: store.status,
          },
          items: [],
          subtotal: new Prisma.Decimal(0),
        });
      }

      const storeGroup = storeMap.get(store.id)!;
      storeGroup.items.push(itemDetail);
      storeGroup.subtotal = storeGroup.subtotal.add(lineTotal);
    }

    return {
      cartId: cart.id,
      customerId,
      currency: cart.currency,
      totalItemsCount,
      grandSubtotal,
      stores: Array.from(storeMap.values()),
    };
  }

  /**
   * Updates quantity of an existing item in the authenticated customer's cart.
   */
  async updateItemQuantity(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const customerId = await this.getOrCreateCustomerProfileId(userId);

    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: {
        cart: true,
        variant: {
          include: {
            product: true,
            inventoryItems: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Cart item with ID "${itemId}" not found.`);
    }

    if (item.cart.customerId !== customerId) {
      throw new ForbiddenException('Access denied. You cannot modify items in another customer’s cart.');
    }

    // Validate available stock
    const invItem = item.variant.inventoryItems.find((inv) => inv.storeId === item.variant.product.storeId);
    const availableStock = invItem ? Math.max(0, invItem.quantityOnHand - invItem.reservedQuantity) : 0;

    if (dto.quantity > availableStock) {
      throw new BadRequestException(
        `Requested quantity (${dto.quantity}) exceeds available stock (${availableStock}).`,
      );
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        quantity: dto.quantity,
        unitPrice: item.variant.price,
      },
    });

    return this.getCart(userId);
  }

  /**
   * Removes a single item from the authenticated customer's cart.
   */
  async removeItem(userId: string, itemId: string) {
    const customerId = await this.getOrCreateCustomerProfileId(userId);

    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });

    if (!item) {
      throw new NotFoundException(`Cart item with ID "${itemId}" not found.`);
    }

    if (item.cart.customerId !== customerId) {
      throw new ForbiddenException('Access denied. You cannot remove items from another customer’s cart.');
    }

    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    return { message: 'Item removed from cart successfully.' };
  }

  /**
   * Clears all items from the customer's active cart.
   */
  async clearCart(userId: string) {
    const customerId = await this.getOrCreateCustomerProfileId(userId);
    const cart = await this.prisma.cart.findFirst({
      where: { customerId, status: CartStatus.ACTIVE },
    });

    if (cart) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }

    return { message: 'Cart cleared successfully.' };
  }
}
