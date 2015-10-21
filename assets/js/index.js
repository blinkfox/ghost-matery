$(document).ready(function() {
    /*菜单在各个屏幕大小下的切换*/
    $('.button-collapse').sideNav();

    /*切换搜索*/
    $('#toggle-search').click(function() {
        var search = $('#search');
        search.is(":visible") ? search.slideUp() : search.slideDown(function() {
            search.find('input').focus();
        });
        return false;
    });

    /*给文章详情内容图片增加light box*/
    // $('#article-content img').addClass('materialboxed');
    // $('.materialboxed').materialbox();
    /*给文章详情内容图片增加响应式的class样式*/
    $('#article-content img').addClass('responsive-img');

    /*回到顶部*/
    $('.scrollSpy').scrollSpy();

    /*回到顶部按钮的显示和隐藏*/
    $(window).scroll(function(event){
        var t = $(window).scrollTop();
        var ts = $('.top-scroll');
        if (t < 50) {
            ts.hide();
        } else {
            ts.show();
        }
    });

});
