(function (window, document) {
    var MScroll = (function () {
        function MScroll(el, options) {
            this.wrapper = typeof el == 'string' ? document.querySelector(el) : el;
            this.scroller = this.wrapper.children[0];
            this.scrollerStyle = this.scroller.style;

            this.options = {
                disableTouch: !utils.hasTouch,
                disableMouse: utils.hasTouch,

                // 那个方向滚动
                scrollX: false,
                scrollY: true,

                momentum: true, // 启动惯性

                // 反弹效果
                bounce: true,
                bounceTime: 600,
                bounceEasing: '',

                // 为了增加下拉刷新功能，增加一个距离
                topOffset: 0,

                // 阻力系数，到达临界点 拖动阻力
                dragForce: 3,

                // 启用css3 过度
                useTransition: true,
                useTransform: true,

                // 频繁更改窗口尺寸的话，最小调用 回调时间
                resizePolling: 60,

                // 是否需要 滚动条
                scrollbars: true,

                // 事件监听对象
                bindToWrapper: typeof window.onmousedown === "undefined"
            }
            for (var i in options) {
                this.options[i] = options[i];
            }

            // 3d加速
            this.translateZ = utils.hasPerspective ? ' translateZ(0)' : '';
            this.options.useTransition = utils.hasTransition && this.options.useTransition;
            this.options.useTransform = utils.hasTransform && this.options.useTransform;

            // defaults
            this.x = 0;
            this.y = 0;
            this.directionX = 0;
            this.directionY = 0;

            // 存储自定义事件
            this._events = {};

            this._init();
        }
        return MScroll
    })();
    MScroll.prototype = {
        version: '0.0.1',
        constructor: MScroll,
        _init: function () {
            this._initEvents()
            if (this.options.scrollbars) {
                this._initIndicators();
            }
            // 还没有什么用到的地方，留作 滑动开关控制
            this.enable();
            this.refresh();
        },
        _start: function (e) {
            if (!this.enabled) {
                return;
            }
            if (this.initiated && utils.eventType[e.type] !== this.initiated) {
                return;
            }
            e && e.preventDefault();
            e && e.stopPropagation();
            // 计算偏移量
            this.distX = 0;
            this.distY = 0;
            // 记录开始 时间
            this.startTime = utils.getTime();

            var point = e.touches ? e.touches[0] : e;

            // 开启滑动开关
            this.initiated = utils.eventType[e.type];
            this.moved = false;

            // 如果正在进行过渡动画，再次触摸，停止动画
            if (this.options.useTransition && this.isInTransition) {
                this._transitionTime();
                this.isInTransition = false;
                pos = this.getComputedPosition();
                this._translate(Math.round(pos.x), Math.round(pos.y));
                this._fire('scrollEnd');
            }

            // 初始 transform 偏移量
            this.startX = this.x;
            this.startY = this.y;
            // 开始 坐标
            this.pointX = point.pageX;
            this.pointY = point.pageY;
        },
        _move: function (e) {
            if (!this.enabled) {
                return;
            }
            // _start 里初始化 类型，不一致不做任何操作，_end里会清空
            if (utils.eventType[e.type] !== this.initiated) {
                return;
            }
            // 阻止默认事件
            e && e.preventDefault();
            e && e.stopPropagation();
            var point = e.touches ? e.touches[0] : e,
                deltaX = point.pageX - this.pointX,
                deltaY = point.pageY - this.pointY,
                timestamp = utils.getTime(),
                newX, newY,
                absDistX, absDistY;

            // 更新 触点 坐标位置
            this.pointX = point.pageX;
            this.pointY = point.pageY;

            this.distX += deltaX;
            this.distY += deltaY;

            absDistX = Math.abs(this.distX)
            absDistY = Math.abs(this.distY)

            // 如果滑动距离太短，不做滚动操作
            if (timestamp - this.endTime > 300 && (absDistX < 10 && absDistY < 10)) {
                return;
            }

            // 计算最终 偏移位置
            if (!this.options.scrollY) {
                deltaY = 0;
            }
            if (!this.options.scrollX) {
                deltaX = 0;
            }
            newX = this.x + deltaX;
            newY = this.y + deltaY;

            // 如果到达最值，做 阻力限制
            if (newX > 0 || newX < this.maxScrollX) {
                newX = this.options.bounce ? this.x + deltaX / this.options.dragForce : newX > 0 ? 0 : this.maxScrollX;
            }
            if (newY > this.minScrollY || newY < this.maxScrollY) {
                newY = this.options.bounce ? this.y + deltaY / this.options.dragForce : newY > this.minScrollY ? this.minScrollY : this.maxScrollY;
            }

            // 开始 滚动，这里可以加入钩子函数
            if (!this.moved) {
                this._fire('scrollStart')
            }
            this.moved = true;
            this._translate(newX, newY);

            // 更新 位置
            if (timestamp - this.startTime > 300) {
                this.startTime = timestamp;
                this.startX = this.x;
                this.startY = this.y;
            }
            this._fire('scroll')
        },
        _end: function (e) {
            if (!this.enabled) {
                return;
            }
            if (utils.eventType[e.type] !== this.initiated) {
                return;
            }
            e && e.preventDefault();
            e && e.stopPropagation();

            var point = e.changedTouches ? e.changedTouches[0] : e,
                momentumX,
                momentumY,
                duration = utils.getTime() - this.startTime,
                newX = Math.round(this.x),
                newY = Math.round(this.y),
                // 最后的大约300ms以内 滑动的距离
                distanceX = Math.abs(newX - this.startX),
                distanceY = Math.abs(newY - this.startY),
                time = 0,
                easing = '';

            // 过渡开关
            this.isInTransition = 0;

            // 关闭滑动开关
            this.initiated = 0;
            this.endTime = utils.getTime();

            // 判断是不是临界点
            if (this.resetPosition()) {
                return;
            }
            // 先定位到 保存的 坐标位置,然后启动惯性系统
            this.scrollTo(newX, newY);

            // 计算 惯性动量
            if (this.options.momentum && duration < 300) {
                momentumX = this.hasHorizontalScroll ? utils.momentum(this.x, this.startX, duration, this.maxScrollX, this.options.bounce ? this.wrapperWidth : 0, this.options.deceleration) : {
                    destination: newX,
                    duration: 0
                };
                // 说明： 如果缓冲计算位置 比 最新minScrollY 小，会发生什么情况，需要测试
                // 理论上 缓冲计算位置 应该比 最小minScrollY || 0 要大
                momentumY = this.hasVerticalScroll ? utils.momentum(this.y, this.startY, duration, this.maxScrollY, this.options.bounce ? this.wrapperHeight : 0, this.options.deceleration) : {
                    destination: newY,
                    duration: 0
                };
                newX = momentumX.destination;
                newY = momentumY.destination;
                time = Math.max(momentumX.duration, momentumY.duration);
                // 开启过渡
                this.isInTransition = 1;
            }

            if (newX != this.x || newY != this.y) {
                // 启动反弹效果
                if (newX > 0 || newX < this.maxScrollX || newY > 0 || newY < this.maxScrollY) {
                    easing = utils.ease.quadratic;
                }
                this.scrollTo(newX, newY, time, easing);
                return;
            }
            this._fire('scrollEnd');
        },
        _transitionEnd: function (e) {
            if (e.target != this.scroller || !this.isInTransition) {
                return;
            }
            this._transitionTime();
            if (!this.resetPosition(this.options.bounceTime)) {
                this.isInTransition = false;
                this._fire('scrollEnd');
            }
        },
        _resize: function () {
            var that = this;
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(function () {
                that.refresh();
            }, this.options.resizePolling);
        },
        // 是否到达临界点，重置位置
        resetPosition: function () {
            var x = this.x,
                y = this.y;

            var time = this.options.bounceTime || 0;
            if (!this.hasHorizontalScroll || this.x > 0) {
                x = 0;
            } else if (this.x < this.maxScrollX) {
                x = this.maxScrollX;
            }
            if (!this.hasVerticalScroll || this.y > this.minScrollY) {
                y = this.minScrollY;
            } else if (this.y < this.maxScrollY) {
                y = this.maxScrollY;
            }
            if (x == this.x && y == this.y) {
                return false;
            }
            this.scrollTo(x, y, time, this.options.bounceEasing);
            return true;
        },
        scrollTo: function (x, y, time, easing) {
            easing = easing || utils.ease.circular;

            this.isInTransition = this.options.useTransition && time > 0;
            var transitionType = this.options.useTransition && easing.style;
            if (transitionType) {
                this._transitionTimingFunction(easing.style);
                this._transitionTime(time);
            }
            this._translate(x, y);
        },
        _transitionTime: function (time) {
            if (!this.options.useTransition) {
                return;
            }
            time = time || 0;
            var durationProp = utils.style.transitionDuration;
            if (!durationProp) {
                return;
            }
            this.scrollerStyle[durationProp] = time + 'ms';

        },
        _transitionTimingFunction: function (easing) {
            this.scrollerStyle[utils.style.transitionTimingFunction] = easing;
        },
        _translate: function (x, y) {
            this.scrollerStyle[utils.style.transform] = 'translate(' + x + 'px,' + y + 'px)' + this.translateZ;
            // if (this.options.useTransform) {
            //     this.scrollerStyle[utils.style.transform] = 'translate(' + x + 'px,' + y + 'px)' + this.translateZ;
            // }
            this.x = x;
            this.y = y;
            console.log(this.x, this.y)
            if (this.indicators) {
                for (var i = this.indicators.length; i--;) {
                    this.indicators[i].updatePosition();
                }
            }
        },
        getComputedPosition: function () {
            var matrix = window.getComputedStyle(this.scroller, null),
                x, y;

            if (this.options.useTransform) {
                matrix = matrix[utils.style.transform].split(')')[0].split(', ');
                x = +(matrix[12] || matrix[4]);
                y = +(matrix[13] || matrix[5]);
            }

            return {
                x: x,
                y: y
            };
        },
        disable: function () {
            this.enabled = false;
        },
        enable: function () {
            this.enabled = true;
        },
        refresh: function () {
            // 重置容器
            var wrapperRect = utils.getRect(this.wrapper);
            this.wrapperWidth = wrapperRect.width;
            this.wrapperHeight = wrapperRect.height;
            // 重置 视图
            var rect = utils.getRect(this.scroller);
            this.scrollerWidth = rect.width;
            this.scrollerHeight = rect.height;

            // 重置 滚条距离, 更改自定义 最小距
            this.minScrollY = this.options.topOffset || 0;
            this.maxScrollX = this.wrapperWidth - this.scrollerWidth;
            this.maxScrollY = Math.min(this.wrapperHeight - this.scrollerHeight, this.minScrollY);

            // 是否有滚动
            this.hasHorizontalScroll = this.options.scrollX && this.maxScrollX < 0;
            this.hasVerticalScroll = this.options.scrollY && this.maxScrollY < 0;

            if (!this.hasHorizontalScroll) {
                this.maxScrollX = 0;
                this.scrollerWidth = this.wrapperWidth;
            }

            if (!this.hasVerticalScroll) {
                this.maxScrollY = 0;
                this.scrollerHeight = this.wrapperHeight;
            }
            this.endTime = 0;

            this._fire('refresh')
            this.resetPosition()

        },
        // 注册自定义事件
        on: function (type, fn) {
            if (!this._events[type]) {
                this._events[type] = []
            }
            this._events[type].push(fn);
        },
        // 移除自定义事件
        off: function (type, fn) {
            if (!this._events[type]) {
                return;
            }
            var index = this._events[type].indexOf(fn);
            if (index > -1) {
                this._events[type].splice(index, 1)
            }
        },
        // 触发自定义事件
        _fire: function (type) {
            if (!this._events[type]) {
                return;
            }
            var i = 0,
                len = this._events[type].length;
            if (!len) {
                return;
            }
            for (; i < len; i++) {
                this._events[type][i].apply(this, [].slice.call(arguments, 1));
            }
        },
        _initEvents: function (remove) {
            var eventType = remove ? utils.removeEvent : utils.addEvent,
                target = this.options.bindToWrapper ? this.wrapper : window;
            eventType(window, 'orientationchange', this);
            eventType(window, 'resize', this);

            if (!this.options.disableMouse) {
                eventType(this.wrapper, 'mousedown', this);
                eventType(target, 'mousemove', this);
                eventType(target, 'mousecancel', this);
                eventType(target, 'mouseup', this);
            }

            // if (utils.hasPointer && !this.options.disablePointer) {
            //     eventType(this.wrapper, utils.prefixPointerEvent('pointerdown'), this);
            //     eventType(target, utils.prefixPointerEvent('pointermove'), this);
            //     eventType(target, utils.prefixPointerEvent('pointercancel'), this);
            //     eventType(target, utils.prefixPointerEvent('pointerup'), this);
            // }
            if (!this.options.disableTouch) {
                eventType(this.wrapper, 'touchstart', this);
                eventType(target, 'touchmove', this);
                eventType(target, 'touchcancel', this);
                eventType(target, 'touchend', this);
            }

            eventType(this.scroller, 'transitionend', this);
            eventType(this.scroller, 'webkitTransitionEnd', this);
            eventType(this.scroller, 'oTransitionEnd', this);
            eventType(this.scroller, 'MSTransitionEnd', this);
        },
        handleEvent: function (e) {
            switch (e.type) {
                case 'touchstart':
                case 'mousedown':
                    this._start(e);
                    break;
                case 'touchmove':
                case 'mousemove':
                    this._move(e);
                    break;
                case 'touchend':
                case 'mouseup':
                case 'touchcancel':
                case 'mousecancel':
                    this._end(e);
                    break;
                case 'orientationchange':
                case 'resize':
                    this._resize();
                    break;
                case 'transitionend':
                case 'webkitTransitionEnd':
                case 'oTransitionEnd':
                case 'MSTransitionEnd':
                    this._transitionEnd(e);
                    break;
            }
        },
        _initIndicators: function () {
            this.indicators = [];
            if (this.options.scrollY) {
                var el = Indicator.createDefaultScrollbar('v');
                this.wrapper.appendChild(el)
                this.indicators.push(new Indicator(this, {
                    'el': el
                }))
            }
            if (this.options.scrollX) {
                var el = Indicator.createDefaultScrollbar('h');
                this.wrapper.appendChild(el);
                this.indicators.push(new Indicator(this, {
                    'el': el
                }))
            }
            this.on('refresh', function () {
                for (var i = this.indicators.length; i--;) {
                    this.indicators[i].refresh.call(this.indicators[i])
                }
            })
        }
    }

    var Indicator = (function () {
        function Indicator(scroller, options) {
            this.wrapper = options.el;
            this.wrapperStyle = this.wrapper.style;
            this.indicator = this.wrapper.children[0];
            this.indicatorStyle = this.indicator.style;
            this.scroller = scroller;
        }
        Indicator.createDefaultScrollbar = function (direction) {
            var scrollbar = document.createElement('div'),
                indicator = document.createElement('div');

            scrollbar.style.cssText = 'position:absolute;z-index:9999';
            indicator.style.cssText = '-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;position:absolute;background:rgba(0,0,0,0.4);border-radius:4px';

            if (direction == 'v') {
                scrollbar.className = 'MScrollVerticalBar';
                scrollbar.style.cssText += ';width: 5px;bottom: 2px;top: 2px;right: 1px;overflow: hidden';
                indicator.style.cssText += ';width: 100%;'
            }
            scrollbar.appendChild(indicator);
            return scrollbar;
        }
        return Indicator;
    })();

    Indicator.prototype = {
        constructor: Indicator,
        refresh: function () {
            this.wrapperHeight = this.wrapper.clientHeight;
            // 设置 滚条跳高度
            this.indicatorHeight = this.wrapperHeight * this.wrapperHeight / (this.scroller.scrollerHeight || this.wrapperHeight || 1);
            this.indicatorStyle.height = this.indicatorHeight + 'px';
            console.log(this.scroller.hasVerticalScroll)
            // 计算 相对比例，相对于与滑动容器缩放比
            this.maxPosY = this.wrapperHeight - this.indicatorHeight;
            this.sizeRatioY = Math.min(this.maxPosY / (this.scroller.maxScrollY || 1), 1);
            this.updatePosition();
        },
        updatePosition: function () {
            var x = Math.round(this.sizeRatioX * this.scroller.x) || 0,
                y = Math.round(this.sizeRatioY * this.scroller.y) || 0;
            this.x = x;
            this.y = y;
            this.indicatorStyle[utils.style.transform] = 'translate(' + x + 'px,' + y + 'px)' + this.scroller.translateZ;
        }
    }

    if (typeof module != 'undefined' && module.exports) {
        module.exports = MScroll;
    } else if (typeof define == 'function' && define.amd) {
        define(function () {
            return MScroll;
        });
    } else {
        window.MScroll = MScroll;
    }
})(window, document)